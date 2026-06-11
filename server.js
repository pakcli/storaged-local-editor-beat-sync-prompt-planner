const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3000;

// Setup directories
const baseDir = path.join(__dirname, 'musicsyncprompteditor');
const mp3Dir = path.join(baseDir, 'mp3');
const projectsDir = path.join(baseDir, 'projects');

if (!fs.existsSync(baseDir)) fs.mkdirSync(baseDir);
if (!fs.existsSync(mp3Dir)) fs.mkdirSync(mp3Dir);
if (!fs.existsSync(projectsDir)) fs.mkdirSync(projectsDir);

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
};

// Main Server Handler
const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;
  const method = req.method;

  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  // API ROUTING
  // 1. Projects API
  if (pathname.startsWith('/api/projects')) {
    const projectSubpath = pathname.replace('/api/projects', '');
    
    // GET /api/projects -> List all projects
    if (method === 'GET' && (projectSubpath === '' || projectSubpath === '/')) {
      fs.readdir(projectsDir, (err, files) => {
        if (err) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Failed to read projects folder' }));
          return;
        }
        const projects = files
          .filter(f => f.endsWith('.json'))
          .map(f => path.basename(f, '.json'));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(projects));
      });
      return;
    }

    // GET /api/projects/:name -> Load specific project
    if (method === 'GET' && projectSubpath.length > 1) {
      const projectName = decodeURIComponent(projectSubpath.substring(1));
      const filePath = path.join(projectsDir, `${projectName}.json`);
      fs.readFile(filePath, 'utf8', (err, data) => {
        if (err) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Project not found' }));
          return;
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(data);
      });
      return;
    }

    // POST /api/projects/:name -> Save specific project
    if (method === 'POST' && projectSubpath.length > 1) {
      const projectName = decodeURIComponent(projectSubpath.substring(1));
      const filePath = path.join(projectsDir, `${projectName}.json`);
      
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        try {
          // Validate JSON
          JSON.parse(body);
          fs.writeFile(filePath, body, 'utf8', (err) => {
            if (err) {
              res.writeHead(500, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Failed to write project file' }));
              return;
            }
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, message: 'Project saved successfully' }));
          });
        } catch (e) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid JSON payload' }));
        }
      });
      return;
    }

    // DELETE /api/projects/:name -> Delete specific project
    if (method === 'DELETE' && projectSubpath.length > 1) {
      const projectName = decodeURIComponent(projectSubpath.substring(1));
      const filePath = path.join(projectsDir, `${projectName}.json`);
      fs.unlink(filePath, (err) => {
        if (err) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Project file not found' }));
          return;
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, message: 'Project deleted successfully' }));
      });
      return;
    }
  }

  // 2. MP3s API
  if (pathname.startsWith('/api/mp3')) {
    // GET /api/mp3 -> List all MP3 files
    if (method === 'GET') {
      fs.readdir(mp3Dir, (err, files) => {
        if (err) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Failed to read MP3 folder' }));
          return;
        }
        const audios = files.filter(f => f.endsWith('.mp3') || f.endsWith('.wav'));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(audios));
      });
      return;
    }

    // POST /api/mp3 -> Upload an MP3 file
    // Expects filename in query parameter: /api/mp3?filename=song.mp3
    // Expects raw binary in request body (application/octet-stream)
    if (method === 'POST') {
      const filename = url.searchParams.get('filename');
      if (!filename || (!filename.endsWith('.mp3') && !filename.endsWith('.wav'))) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Valid filename with .mp3 or .wav extension is required' }));
        return;
      }

      const safeFilename = path.basename(filename);
      const filePath = path.join(mp3Dir, safeFilename);
      const writeStream = fs.createWriteStream(filePath);

      req.pipe(writeStream);

      writeStream.on('finish', () => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, filename: safeFilename }));
      });

      writeStream.on('error', (err) => {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Failed to write audio file to disk' }));
      });
      return;
    }
  }

  // 3. Serve MP3 files
  if (pathname.startsWith('/mp3/')) {
    const filename = decodeURIComponent(pathname.substring(5));
    const filePath = path.join(mp3Dir, path.basename(filename));

    fs.stat(filePath, (err, stats) => {
      if (err || !stats.isFile()) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Audio file not found');
        return;
      }

      res.writeHead(200, {
        'Content-Type': 'audio/mpeg',
        'Content-Length': stats.size,
        'Accept-Ranges': 'bytes'
      });
      fs.createReadStream(filePath).pipe(res);
    });
    return;
  }

  // STATIC FILE SERVING
  let relativeFilePath = pathname === '/' ? 'index.html' : pathname.substring(1);
  // Prevent path traversal
  const safePath = path.normalize(relativeFilePath).replace(/^(\.\.[\/\\])+/, '');
  const filePath = path.join(__dirname, safePath);

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 Not Found');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, { 'Content-Type': contentType });
    fs.createReadStream(filePath).pipe(res);
  });
});

server.listen(PORT, () => {
  console.log(`VibeSync Backend Server running at http://localhost:${PORT}`);
});
