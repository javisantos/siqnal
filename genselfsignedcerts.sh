#!/bin/bash
openssl genrsa -out certs/privkey.pem 2048
openssl req -new -x509 -key certs/privkey.pem -out certs/fullchain.pem -days 3650 -subj /CN=siqnal.localhost