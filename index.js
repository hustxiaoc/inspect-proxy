const WebSocket = require('ws');
const urlparse = require('url');
const qs = require('querystring');
const urllib = require('urllib');

class InspectProxy {
  constructor(config) {
    this.config = config;
    const port = config.port;
    this.server = new WebSocket.Server({
      perMessageDeflate: false,
      port: config.port
    }, () => {
      console.log(`To start debugging, open the following URL in Chrome:
    chrome-devtools://devtools/bundled/inspector.html?experiments=true&v8only=true&ws=127.0.0.1:${port}?host=hostname:port`);
    });
    this.server.on('connection', client => { this.handleConnection(client)});
  }

  handleConnection(client) {
    client.pendding = [];
    const url = client.upgradeReq.url;
    const query = qs.parse(urlparse.parse(url).query);
    const host = query.host;
    if (!host) {
      const message = {
        "method": "Runtime.consoleAPICalled",
        "params": {
          "type": "error",
          "args": [
            {
              "type": "string",
              "value": "host is required!"
            }
          ],
        }
      }
      client.send(JSON.stringify(message), () => {
        client.close(1003, 'host is required!');
      });
      return;
    }

    client.on('close', () => {
      if (client.proxy) {
        client.proxy.close();
      }
    });

    client.on('error', () => {
      if (client.proxy) {
        client.proxy.close();
      }
    });

    client.on('message', (message) => {
      if (client.proxy) {
        client.proxy.send(message);
      } else {
        client.pendding.push(message);
      }
    });

    urllib.request(`http://${host}/json/list`, {dataType: 'json'}).then(res => {
      const data = res.data[0];
      const webSocketDebuggerUrl = data.webSocketDebuggerUrl;
      const proxy = new WebSocket(webSocketDebuggerUrl);

      proxy.on('open', () => {
        client.proxy = proxy;
        for(let message of client.pendding) {
          proxy.send(message);
        }
        client.pendding = [];
      });

      proxy.on('close', () => {
        client.close();
      });

      proxy.on('error', (err) => {
        client.close();
      });

      proxy.on('message', (message) => {
        client.send(message);
      });

    });
  }
}

module.exports = (config) => {
  return new InspectProxy(config);
};
