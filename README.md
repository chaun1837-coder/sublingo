# SubLingo — bản triển khai có backend

Bản này chuyển giao diện preview thành ứng dụng Node.js có backend thật để:

- Đăng nhập Google bằng Google Identity Services; backend xác minh ID token với Google và tạo cookie phiên `HttpOnly`.
- Gửi lời thoại theo từng nhóm tới OpenAI hoặc Google Gemini.
- Có thể chọn lưu API key trên thiết bị bằng `localStorage` của trình duyệt. Tùy chọn này không mã hóa key; chỉ dùng trên thiết bị cá nhân và xóa key nếu dùng máy tính chung.
- Nhận JSON có `id` và bản dịch; trình duyệt chỉ thay nội dung lời thoại. Số thứ tự, timestamp, metadata và dấu phân cách vẫn lấy nguyên từ file SRT gốc.
- Không lưu API key hoặc file phụ đề trên máy chủ. API key do người dùng nhập chỉ được gửi trong request dịch.

## Chạy thử trên máy tính

Yêu cầu Node.js 20 trở lên.

```bash
cp .env.example .env
npm install
npm start
```

Mở `http://localhost:10000`. Để đăng nhập Google trên localhost, hãy tạo OAuth Client ID loại Web và thêm `http://localhost:10000` vào **Authorized JavaScript origins**, sau đó đặt `GOOGLE_CLIENT_ID` trong `.env`. `SESSION_SECRET` phải là chuỗi ngẫu nhiên dài.

Kiểm tra backend:

```bash
curl http://localhost:10000/api/health
```

## Đưa lên Render

1. Tạo repository GitHub mới và tải toàn bộ nội dung thư mục này lên repository (không tải `.env`).
2. Trong Render, chọn **New → Blueprint**, kết nối repository chứa `render.yaml`, rồi chọn **Deploy Blueprint**. Render sẽ dựng web service theo cấu hình trong file này. Nếu không dùng Blueprint, tạo Web Service với Build Command `npm install` và Start Command `npm start`.
3. Trong phần Environment của Render, đặt `GOOGLE_CLIENT_ID` bằng OAuth Client ID loại Web. `SESSION_SECRET` được `render.yaml` tạo tự động.
4. Trong Google Cloud Console, ở OAuth Client ID loại Web, thêm URL website Render, ví dụ `https://ten-app.onrender.com`, vào **Authorized JavaScript origins**. Không cần redirect URI vì ứng dụng dùng Google Identity Services popup.
5. Lưu cấu hình và deploy lại. Mở `https://ten-app.onrender.com/api/health`; kết quả mong đợi là `{"ok":true,"service":"sublingo-api"}`.

## Cấu hình API key

Người dùng nhập OpenAI API key hoặc Gemini API key ngay trong giao diện. Backend không ghi key vào file, database, session hay log; key chỉ được gửi qua HTTPS trong request dịch và chuyển tiếp tới nhà cung cấp tương ứng. Nếu người dùng chủ động bấm “Lưu key trên thiết bị”, trình duyệt lưu key trong `localStorage` để dùng lại sau khi tải trang. `localStorage` không mã hóa key, vì vậy không nên bật tùy chọn này trên máy tính dùng chung. Người dùng có thể xóa key bằng nút “Xóa key đã lưu”. Người dùng chịu phí API của chính tài khoản nhà cung cấp của mình.

## Lưu ý bảo mật và vận hành

- Bắt buộc dùng HTTPS khi public website. Render cấp HTTPS cho miền `onrender.com`.
- Không commit `.env`, API key, OAuth client secret hoặc `SESSION_SECRET` vào GitHub.
- Đổi `SESSION_SECRET` sẽ đăng xuất các phiên hiện tại.
- Giao diện chia file thành các nhóm tối đa 60 cue và 24.000 ký tự mỗi request; mỗi cue tối đa 5.000 ký tự để nằm trong giới hạn backend. Riêng Gemini nghỉ 4,5 giây giữa các request. Khi gặp lỗi tạm thời như 408, 429, 5xx hoặc lỗi mạng, ứng dụng thử lại tối đa 3 lần với thời gian chờ tăng dần; lỗi key/model không hợp lệ sẽ dừng sớm để người dùng sửa. Backend chấp nhận tối đa 80 cue/request và giới hạn tổng văn bản mỗi request ở 30.000 ký tự. Tiến độ và trạng thái hoàn thành được theo dõi riêng, kể cả khi bản dịch trùng với câu gốc.
- Giới hạn rate hiện tại là 120 request/15 phút/IP; cần điều chỉnh khi có nhiều người dùng thật.
- Bản này không có cơ sở dữ liệu người dùng vì đăng nhập chỉ dùng để xác thực phiên. Nếu cần lịch sử dịch, phân quyền, gói trả phí hoặc quản trị, cần bổ sung database.
- Bản này không tự động publish. Chủ tài khoản phải kết nối repository và cấu hình biến môi trường trên Render.

## Kiểm tra

```bash
npm test
```
