FROM node:12.3.0-alpine
WORKDIR /home/siqnal/
COPY package*.json ./
RUN npm install
COPY . .
CMD [ "npm", "start" ]