// ⭐ 必须放在最顶部！所有require之前！
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

const https = require('https');
const cheerio = require('cheerio');
const express = require('express');
const app = express();
const port = process.env.PORT || 3000;

const ignoreAgent = new https.Agent({
  rejectUnauthorized: false
});

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  next();
});

function fetchHtml(targetUrl) {
  return new Promise((resolve, reject) => {
    const u = new URL(targetUrl);
    const opts = {
      hostname: u.hostname,
      port: u.port || 443,
      path: u.pathname + u.search,
      method: 'GET',
      agent: ignoreAgent,
      rejectUnauthorized: false, // 额外再加一层兜底
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36'
      }
    };
    const req = https.request(opts, (resp) => {
      let buf = '';
      resp.on('data', chunk => buf += chunk);
      resp.on('end', () => resolve(buf));
    });
    req.on('error', e => reject(e));
    req.end();
  });
}

function predictBigSmall(arr) {
  const nums = arr.filter(x=>!isNaN(x) && isFinite(x));
  if(nums.length < 4) return {ok:false, tip:"历史数据不足，至少4个连续数字才可研判大小"};
  
  const avg = nums.reduce((a,b)=>a+b,0)/nums.length;
  const n = nums.length;
  let sumX=0,sumY=0,sumXY=0,sumX2=0;
  for(let i=0;i<n;i++){
    sumX += i;
    sumY += nums[i];
    sumXY += i*nums[i];
    sumX2 += i*i;
  }
  const slope = (n*sumXY - sumX*sumY) / (n*sumX2 - sumX*sumX);
  const intercept = (sumY - slope*sumX)/n;
  const nextVal = slope * n + intercept;

  const result = nextVal >= avg ? "大" : "小";
  return {
    ok:true,
    history:nums,
    threshold: parseFloat(avg.toFixed(4)),
    nextPredValue: parseFloat(nextVal.toFixed(4)),
    result: result
  }
}

app.get('/api/proxy-html', async (req, res) => {
  try {
    const targetUrl = req.query.url;
    if(!targetUrl) return res.status(400).send('缺少url参数');
    const html = await fetchHtml(targetUrl);
    res.removeHeader('X-Frame-Options');
    res.removeHeader('Content-Security-Policy');
    res.send(html);
  }catch(err){
    res.status(500).send(`抓取失败：${err.message}`);
  }
})

app.get('/api/extract-text', async (req, res) => {
  try {
    const targetUrl = req.query.url;
    if(!targetUrl) return res.status(400).json({err:'缺少url'});
    const html = await fetchHtml(targetUrl);
    const $ = cheerio.load(html);
    const rawText = $('body').text().replace(/\s+/g,' ').trim();

    const numMatch = rawText.match(/[-+]?\d+\.?\d*/g) || [];
    const numList = numMatch.map(v=>parseFloat(v));
    const predResult = predictBigSmall(numList);

    res.json({
      text:rawText,
      numList,
      predResult
    });
  }catch(err){
    res.json({err: err.message});
  }
})

app.listen(port, ()=>{
  console.log(`服务启动，端口${port}`)
})
