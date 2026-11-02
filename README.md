# SubLingo 1.1.2 — Dịch phụ đề SRT

**Phiên bản hiện tại:** 1.1.2 — *Auth Session Caching & Gemini Error Diagnostics*.

SubLingo là ứng dụng Node.js có backend để dịch phụ đề SRT bằng Google Gemini hoặc OpenAI.

## Tính năng

- Đăng nhập Google bằng Google Identity Services; backend xác minh ID token, nonce dùng một lần và tạo cookie phiên HttpOnly.
- Đăng xuất xóa hai API key đã lưu trong trình duyệt, dữ liệu phụ đề tạm và hủy lượt dịch đang chạy.
- Gửi lời thoại theo từng nhóm tới Google Gemini hoặc OpenAI.
- Giữ nguyên số thứ tự, timestamp, metadata, dấu phân cách và kiểu xuống dòng từ file SRT gốc.
- Có thể chọn lưu API key trên thiết bị bằng localStorage. Tùy chọn này **không mã hóa key**; chỉ nên dùng trên thiết bị cá nhân.
- Giới hạn file ở 10 MB và 5.000 cue để tránh treo trình duyệt; mỗi cue tối đa 5.000 ký tự.
- Không lưu API key hoặc file phụ đề trong database trên máy chủ. OpenAI Responses được gọi với store: false.

## Model hiện hỗ trợ

| Nhà cung cấp | Model ID |
|---|---|
| OpenAI | gpt-6-luna, gpt-6.1-terra |
| Gemini (đã đăng nhập) | gemini-3.8-flash, gemini-3.5-flash-lite |
| Gemini (chưa đăng nhập) | gemini-3.5-flash-lite |

Model khả dụng còn phụ thuộc quyền truy cập và hạn mức của API key do người dùng cung cấp.

## Chạy thử trên máy tính

Yêu cầu Node.js 20 trở lên.

~~~bash
cp .env.example .env
npm install
npm start
~~~

Mở http://localhost:10000. Để đăng nhập Google trên localhost, tạo OAuth Client ID loại Web và thêm http://localhost:10000 vào **Authorized JavaScript origins**, sau đó đặt GOOGLE_CLIENT_ID trong .env. SESSION_SECRET phải là chuỗi ngẫu nhiên dài.

Kiểm tra backend:

~~~bash
curl http://localhost:10000/api/health
~~~

Endpoint trả về trạng thái cùng phiên bản hiện tại, ví dụ {"ok":true,"service":"sublingo-api","version":"1.1.2"}.

## Đưa lên Render

1. Kết nối repository GitHub với Render và tạo Web Service (Build Command `npm install`, Start Command `npm start`).
2. Trong **Environment** của Render, đặt `GOOGLE_CLIENT_ID` bằng OAuth Client ID loại **Web application**. Giữ `SESSION_SECRET` là chuỗi ngẫu nhiên dài đã tạo cho service.
3. Trong Google Cloud Console, thêm `https://sublingo-srt-translator.onrender.com` vào **Authorized JavaScript origins** của OAuth Client ID. Ứng dụng dùng Google Identity Services popup nên không cần redirect URI.
4. Lưu cấu hình và chờ Render khởi động lại service. Khi chưa có `GOOGLE_CLIENT_ID`, nút đăng nhập sẽ hiển thị trạng thái đang chờ cấu hình; đây không phải lỗi tài khoản Google.
5. Ứng dụng hiện hỗ trợ **đăng nhập bằng Google**, chưa có đăng ký email/mật khẩu riêng. Phiên đăng nhập được lưu bằng cookie HttpOnly trong 7 ngày; ứng dụng chưa lưu hồ sơ người dùng hoặc lịch sử dịch vào database.
4. Sau khi deploy, kiểm tra /api/health và xác nhận trường version là 1.1.2.

## Cấu hình API key

Người dùng nhập OpenAI API key hoặc Gemini API key trong giao diện. Key chỉ được gửi qua HTTPS trong request dịch và chuyển tiếp tới nhà cung cấp tương ứng; không ghi key vào file, database, session hay log của ứng dụng. Nếu người dùng bấm “Lưu key trên thiết bị”, trình duyệt lưu key trong localStorage để dùng sau khi tải trang. localStorage không mã hóa key nên không bật tùy chọn này trên máy tính dùng chung. Người dùng chịu phí API của tài khoản nhà cung cấp của mình.

## Bảo mật và vận hành

- Website public phải dùng HTTPS.
- Không commit .env, API key, OAuth client secret hoặc SESSION_SECRET vào GitHub.
- Đổi SESSION_SECRET sẽ làm hết hiệu lực các phiên đăng nhập hiện tại.
- Giao diện chia file thành các nhóm tối đa 60 cue và 24.000 ký tự mỗi request; mỗi cue tối đa 5.000 ký tự. Gemini 3.8 Flash dùng thinking LOW và giới hạn khoảng cách tối thiểu 6 giây giữa thời điểm bắt đầu hai request; Gemini 3.5 Flash-Lite giữ mức thinking MINIMAL và khoảng cách 4,5 giây. Khoảng chờ chỉ được áp dụng khi cần, không cộng thêm sau một phản hồi vốn đã chậm.
- Khi gặp lỗi tạm thời như 408, 429, 5xx hoặc lỗi mạng, ứng dụng thử lại với exponential backoff và jitter; với Gemini, thời gian Retry-After/RetryInfo từ Google được ưu tiên. Hạn mức theo ngày không bị thử lại liên tục; sau nhiều lần 429, ứng dụng dừng gửi thêm nhóm để tránh làm nặng thêm giới hạn.
- Hủy lượt dịch ở trình duyệt sẽ đóng request và báo backend hủy tiếp công việc gọi AI nếu kết nối đã bị ngắt.
- Backend giới hạn 80 cue/request, 30.000 ký tự/request và 120 request/15 phút/IP.
- Ứng dụng không có database người dùng hoặc lịch sử dịch. Nếu cần lịch sử, phân quyền, gói trả phí hoặc quản trị, cần bổ sung database.

## Kiểm tra

~~~bash
npm test
~~~

GitHub Actions tự chạy bộ test khi có push hoặc pull request vào nhánh main.

## Nhật ký phiên bản

### 1.1.2
- Chặn cache cho API đăng nhập, thông tin phiên và nội dung dịch; trình duyệt luôn lấy trạng thái phiên mới.
- Phân biệt rõ lỗi Gemini 400, 401 và 403 để hướng dẫn sửa đúng nguyên nhân.
- Hiển thị thông báo rõ ràng khi Google Client ID chưa được cấu hình.
- Đồng bộ số phiên bản giữa giao diện, package và hướng dẫn triển khai.

### 1.1.1
- Gemini 3.8 Flash dùng thinking LOW; Gemini 3.5 Flash-Lite giữ thinking MINIMAL.
- Bỏ sampling temperature khỏi yêu cầu Gemini 3.x.
- Điều chỉnh nhịp gửi theo thời điểm bắt đầu request để không cộng thêm 4,5–6 giây sau phản hồi chậm.
- Đọc Retry-After/Google RetryInfo, phân biệt hạn mức theo ngày và dừng sớm khi tiếp tục bị 429.

### 1.1.0
- Sửa luồng nonce Google sau khi đăng nhập lỗi hoặc đăng xuất.
- Xóa API key và dữ liệu phụ đề tạm khi đăng xuất; hỗ trợ hủy request dịch.
- Sửa trạng thái bị kẹt nếu gặp cue vượt giới hạn.
- Giữ nguyên timestamp gốc khi đọc/xuất SRT, hỗ trợ định dạng xuống dòng CRLF/LF/CR.
- Giới hạn dung lượng file, số cue và ngăn lỗi đọc file theo thứ tự sai.
- Cập nhật model OpenAI; tắt lưu Responses phía OpenAI; tránh cache HTML cũ.
- Bổ sung test và CI.
