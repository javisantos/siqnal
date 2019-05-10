
import EventEmitter from 'events';
import fs from 'fs';
import http2 from 'http2';
import hyperid from 'hyperid';
import icon from 'log-symbols';

const log = console.log
const namespaces = new Map()
const randomId = hyperid()

const commonHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, HEAD, DELETE, PATCH, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Accept, Authorization'
}

export class Siqnaler extends EventEmitter {
    constructor(port = 8443) {
        super()
        this.env = process.env.NODE_ENV || 'development'
        this.port = process.env.PORT || port
        this.host = '0.0.0.0'
        const server = http2.createSecureServer({
            key: fs.readFileSync('/certs/privkey.pem'),
            cert: fs.readFileSync('/certs/fullchain.pem'),
            allowHTTP1: false
        })
        server.on('stream', this.onStream.bind(this))

        server.on('listening', () => super.emit('listening', server.address()))
        server.listen(this.port, this.host, () => {
            console.log("Listening", server.address())
        })
    }
    async onStream(stream, headers) {

        if (headers[':path'] === '/') {
            stream.respond({
                ':status': 200
            })
            stream.end(`Http Event Emitter ${process.env.npm_package_version}`)
            return
        }
        if (headers[':path'] === '/favicon.ico') {
            stream.respond({
                ':status': 404
            })
            stream.end()
            return
        }
        stream.on('error', e => {
            log(icon.error, `[ERROR STREAM ${stream.id}]`, e)
        })
        stream.on('end', e => {
            // log(icon.error, `[END STREAM ${stream.id}]`)
        })
        stream.on('close', () => {
            var streams = namespaces.get(stream.path)

            if (streams) {
                streams.forEach(s => {
                    if (s.id === stream.id) {
                        var index = streams.indexOf(s)
                        if (index > -1) {
                            streams.splice(index, 1)
                        }
                    }
                })
            }
            if (streams && streams.length === 0)
                namespaces.delete(stream.path)

            this.report()
        })

        if (headers[':method'] === 'POST') this.onPost(stream, headers)
        if (headers[':method'] === 'GET') this.onGet(stream, headers)
        if (headers[':method'] === 'OPTIONS') {
            stream.respond(
                Object.assign({}, commonHeaders, {
                    'Content-Length': '0',
                    ':status': 200
                })
            )
            stream.end()
        }
    }


    async onGet(stream, headers) {
        let path = headers[':path'].slice(1)
        console.log("path", path)
        stream.path = path
        stream.peerid = randomId()
        stream.respond(
            Object.assign(commonHeaders, {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'X-Accel-Buffering': 'no',
                ':status': 200
            })
        )
        stream.write(Buffer.from(`retry: 5000\nevent: ready\nid: ${randomId()}\ndata: ${JSON.stringify(hyperid.decode(randomId()))}\n\n`))

        const pushArray = (array, value) => array.concat([value])

        namespaces.has(path)
            ? namespaces.set(path, pushArray(namespaces.get(path), stream))
            : namespaces.set(path, pushArray([], stream))

        this.report()
        this.broadcast(path, 'peer', { id: stream.peerid })
        super.emit('peer', stream.id, path)
    }

    onPost(stream, headers) {
        let path = headers[':path'].slice(1)
        let body = ''
        stream
            .on('data', chunk => {
                body += chunk.toString()
                console.log('POST!', body)
            })
            .on('end', async () => {
                try {
                    let data = JSON.parse(body)
                    super.emit('event', { data, path })
                    stream.respond(
                        Object.assign(commonHeaders, {
                            ':status': 202
                        })
                    )
                    stream.end(Buffer.from(JSON.stringify({ success: true })))
                    let type = 'message'
                    if (data.type) type = data.type

                    this.broadcast(path, type, data)
                } catch (e) {
                    stream.respond(
                        Object.assign(commonHeaders, {
                            ':status': 400
                        })
                    )
                    stream.write(JSON.stringify({ success: false, error: 'Request body should be a valid json' }))
                    stream.end()
                }
            })
    }

    broadcast(path, type, payload) {
        let UUID = randomId()
        console.log('sending', payload);
        if (payload && typeof payload !== 'object')
            throw new Error("Payload should be an object")
        if (!payload && typeof type !== 'object')
            throw new Error("Payload should be an object")

        var content = `event: ${typeof type === 'string' ? type : 'message'}\nid: ${UUID}\ndata: ${JSON.stringify(type ? payload : type)}\n\n`

        if (namespaces.has(path)) {
            namespaces.get(path).forEach(stream => {
                if (!stream.closed)
                    stream.write(Buffer.from(content), content.length)
            })
        }
    }

    report() {
        namespaces.forEach((value, key) => {
            console.log(icon.info, `[${key}] ${value.length} connection/s`)
        })

    }
}


const siqnal = new Siqnaler()