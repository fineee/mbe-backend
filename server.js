// ═══════════════════════════════════════════════════════════════
// MathBridgeEnglish — Máy chủ trung gian cho AI Gia sư
// Giữ API key an toàn, không lộ ra trình duyệt
// ═══════════════════════════════════════════════════════════════

const http = require("http");
const https = require("https");

const PORT = process.env.PORT || 3000;
const API_KEY = process.env.ANTHROPIC_API_KEY;

// Chỉ cho phép các trang web này gọi (đổi thành link GitHub Pages của bạn)
const ALLOWED = [
  "https://fineee.github.io", // trang GitHub Pages cua ban
  "http://localhost:3000",
  "http://127.0.0.1:5500",
  "null", // khi mo file .html truc tiep
];

function setCors(res, origin) {
  // Truong hop mo file .html truc tiep tu o dia:
  // trinh duyet gui Origin la "null" hoac khong gui gi ca
  if (!origin || origin === "null") {
    res.setHeader("Access-Control-Allow-Origin", "*");
  } else {
    const ok = ALLOWED.some((a) => origin.startsWith(a));
    res.setHeader("Access-Control-Allow-Origin", ok ? origin : ALLOWED[0]);
  }
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Max-Age", "86400");
}

const server = http.createServer((req, res) => {
  const origin = req.headers.origin || "";
  setCors(res, origin);

  // Trình duyệt hỏi trước khi gửi request thật
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    return res.end();
  }

  // Kiểm tra máy chủ còn sống không
  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ ok: true, hasKey: !!API_KEY }));
  }

  if (req.method !== "POST" || req.url !== "/api/chat") {
    res.writeHead(404, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ error: "Not found" }));
  }

  if (!API_KEY) {
    res.writeHead(500, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ error: "Chưa cài ANTHROPIC_API_KEY" }));
  }

  // Nhận dữ liệu từ app
  let body = "";
  req.on("data", (chunk) => {
    body += chunk;
    if (body.length > 1e6) req.destroy(); // chặn gói tin quá lớn
  });

  req.on("end", () => {
    let payload;
    try {
      payload = JSON.parse(body);
    } catch (e) {
      res.writeHead(400, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: "JSON không hợp lệ" }));
    }

    // Giới hạn để tránh bị lạm dụng
    const safe = {
      model: "claude-sonnet-4-20250514",
      max_tokens: Math.min(payload.max_tokens || 1000, 1500),
      system: String(payload.system || "").slice(0, 2000),
      messages: (payload.messages || []).slice(-12).map((m) => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: String(m.content || "").slice(0, 4000),
      })),
    };

    if (!safe.messages.length) {
      res.writeHead(400, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: "Thiếu nội dung câu hỏi" }));
    }

    const data = JSON.stringify(safe);
    const apiReq = https.request(
      {
        hostname: "api.anthropic.com",
        path: "/v1/messages",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(data),
          "x-api-key": API_KEY,
          "anthropic-version": "2023-06-01",
        },
      },
      (apiRes) => {
        let out = "";
        apiRes.on("data", (c) => (out += c));
        apiRes.on("end", () => {
          res.writeHead(apiRes.statusCode, { "Content-Type": "application/json" });
          res.end(out);
        });
      }
    );

    apiReq.on("error", (err) => {
      console.error("[MBE] Lỗi gọi API:", err.message);
      res.writeHead(502, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Không kết nối được tới AI" }));
    });

    apiReq.write(data);
    apiReq.end();
  });
});

server.listen(PORT, () => {
  console.log(`[MBE] Máy chủ chạy ở cổng ${PORT}`);
  console.log(`[MBE] API key: ${API_KEY ? "đã cài ✅" : "CHƯA CÀI ❌"}`);
});
