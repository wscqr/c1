import Fastify from 'fastify';
import axios from 'axios';
import http from 'http';
import https from 'https';

const fastify = Fastify();

// 创建 Agent 实例以复用 TCP 连接
const httpAgent = new http.Agent({ keepAlive: true });
const httpsAgent = new https.Agent({ keepAlive: true });

fastify.get('/proxy', async (request, reply) => {
  const videoUrl = request.query.url;

  if (!videoUrl) {
    reply.code(400).send({ error: 'URL is required' });
    return;
  }

  // 根据文件类型判断处理逻辑
  if (videoUrl.endsWith('.mp4')) {
    return proxyMp4(videoUrl, reply); // 走 MP4 流式代理
  } else if (videoUrl.endsWith('.m3u8')) {
    return proxyM3u8(videoUrl, reply); // 用 axios 请求 M3U8 并返回内容
  } else {
    reply.code(400).send({ error: 'Unsupported file type' });
    return;
  }
});

// MP4 流式代理
function proxyMp4(videoUrl, reply) {
  const protocol = videoUrl.startsWith('https') ? https.request : http.request;

  const agent = videoUrl.startsWith('https') ? httpsAgent : httpAgent;

  const headers = {
    'User-Agent': 'YourCustomUserAgent/1.0',
    'Referer': 'https://example.com',
    'Cookie': 'your-cookie-name=value',
  };

  const proxyRequest = protocol(videoUrl, { headers, agent }, (videoResponse) => {
    if (videoResponse.statusCode !== 200) {
      reply.code(videoResponse.statusCode).send({ error: 'Failed to fetch video' });
      return;
    }

    reply
      .headers({
        'Content-Type': videoResponse.headers['content-type'],
        'Content-Length': videoResponse.headers['content-length'],
      })
      .status(videoResponse.statusCode);

    videoResponse.pipe(reply.raw);

    reply.raw.on('close', () => {
      videoResponse.destroy();
    });
  });

  proxyRequest.on('error', (err) => {
    reply.code(500).send({ error: 'Error fetching video', details: err.message });
  });
}

// 用 axios 请求 M3U8 并返回内容
async function proxyM3u8(videoUrl, reply) {
  try {
    const agent = videoUrl.startsWith('https') ? httpsAgent : httpAgent;

    const response = await axios.get(videoUrl, {
      headers: {
        'User-Agent': 'YourCustomUserAgent/1.0',
        'Referer': 'https://example.com',
        'Cookie': 'your-cookie-name=value',
      },
      responseType: 'text', // 明确指定返回文本内容
      httpAgent,
      httpsAgent,
    });

    reply
      .code(200)
      .type('application/vnd.apple.mpegurl') // 设置 M3U8 的 MIME 类型
      .send(response.data); // 返回 M3U8 文件内容
  } catch (error) {
    reply
      .code(error.response?.status || 500)
      .send({ error: 'Error fetching M3U8', details: error.message });
  }
}

const start = async () => {
  try {
    await fastify.listen({ port: 3000 });
    console.log('Server is running on http://localhost:3000');
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
};

start();
