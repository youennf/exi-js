var http = require('http')
  , url = require('url')
  , fs = require('fs')
  , server;

function endsWith(str, suffix) {
    return str.indexOf(suffix, str.length - suffix.length) !== -1;
}

var extensions = {};
extensions["html"] = "text/html";
extensions["svg"] = "image/svg";
extensions["css"] = "text/css";
extensions["js"] = "text/javascript; charset=utf-8";
extensions["jpg"] = "image/jpeg";
extensions["jpeg"] = "image/jpeg";
extensions["gif"] = "image/gif";
extensions["ico"] = "image/x-icon";
extensions["png"] = "image/png";
extensions["xml"] = "text/xml";
extensions["exi"] = "application/exi";
extensions["efx"] = "application/exi";
extensions["jsn"] = "application/json";
extensions["json"] = "application/json";

server = http.createServer(function(req, res) {
    // your normal server code
    var path = url.parse(req.url).pathname;
    var index = path.lastIndexOf(".");
    if (index != -1) {
        var ct = extensions[path.substring(index + 1)];
        if (ct != null) {
            fs.readFile(__dirname + path, function(err, data) {
                if (err) return send404(res);
                res.writeHead(200, { 'Content-Type': ct })
                res.write(data, 'utf8');
                res.end();
            });
            return;
        }
    }

    switch (path) {
        case '/':
            res.writeHead(302, { 'Location': '/index.html' });
            res.end();
            break;

        default:
		{
			send404(res);
		}
    }
}),

send404 = function(res) {
    res.writeHead(404);
    res.write('404');
    res.end();
};

server.listen(8080);
console.log("Access to this service here: http://localhost:8080");


