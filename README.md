# SubLingo 1.2.17 — Dịch phụ đề SRT & tạo phụ đề tự động

**Phiên bản hiện tại:** 1.2.17 — *Hardsub OCR progress & timeline smoothing*.

SubLingo là ứng dụng Node.js có backend để dịch phụ đề SRT bằng Google Gemini hoặc OpenAI.

## Tính năng

- Đăng nhập Google bằng Google Identity Services; backend xác minh ID token, nonce dùng một lần và tạo cookie phiên HttpOnly.
- Đăng xuất xóa hai API key đã lưu trong trình duyệt, dữ liệu phụ đề tạm và hủy lượt dịch đang chạy.
- Gửi lời thoại theo từng nhóm tới Google Gemini hoặc OpenAI.
- Người dùng tự chọn mức suy luận Gemini: MINIMAL, LOW, MEDIUM hoặc HIGH; lựa chọn được lưu trên trình duyệt. Mặc định là MINIMAL.
- Trang 2 tạo phụ đề tự động từ video bằng Google Gemini 3.5 Transcribe, có xem trước video, sửa lời thoại, tùy chỉnh kiểu chữ xem trước và xuất SRT.
- Giữ nguyên số thứ tự, timestamp, metadata, dấu phân cách và kiểu xuống dòng từ file SRT gốc.
- Có thể chọn lưu API key trên thiết bị bằng localStorage. Tùy chọn này **không mã hóa key**; chỉ nên dùng trên thiết bị cá nhân.
- Giới hạn file ở 10 MB và 5.000 cue để tránh treo trình duyệt; mỗi cue tối đa 5.000 ký tự.
- Không lưu API key hoặc file phụ đề trong database trên máy chủ. OpenAI Responses được gọi với store: false.

## Tạo phụ đề tự động bằng AI (Trang 2)

- Tải video MP4, MOV, MKV, WebM, AVI, M4V, MPEG hoặc MPG; giới hạn hiện tại 150 MB.
- Trang 2 dùng chung Google Gemini API key đã lưu ở Trang 1; cũng có thể nhập key trực tiếp tại Trang 2. Có thể lưu key trong localStorage trên thiết bị cá nhân (không được mã hóa).
- Backend dùng FFmpeg tách âm thanh mono 16 kHz, nén MP3 và áp dụng bộ lọc cơ bản để giảm một phần tiếng ồn nền; đây không phải mô hình tách giọng nói khỏi nhạc.
- Âm thanh được chia thành từng đoạn 9 phút để gửi đến Google Gemini 3.5 Transcribe qua Files API và Interactions API. Model trả về timestamp từng từ; SubLingo gom các từ gần nhau thành câu phụ đề.
- Model giới hạn âm thanh tối đa 30 phút mỗi yêu cầu khi bật timestamp từng từ; các đoạn 9 phút của SubLingo nằm trong giới hạn đó.
- Khi Google trả về lỗi giới hạn tốc độ 429, SubLingo tự chờ theo Retry-After/RetryInfo hoặc backoff rồi thử lại tối đa 3 lần. Hạn mức theo ngày cần chờ quota được đặt lại.
- Video và âm thanh gốc tạm được ghi trong thư mục tạm trên máy chủ và xóa sau khi xử lý. Tệp âm thanh tải lên Google Files API được xóa ngay sau khi nhận diện; tệp còn sót sẽ tự hết hạn sau tối đa 48 giờ.
- Gemini 3.5 Transcribe có Free Tier trong hạn mức được cấp; nếu dự án thuộc Paid Tier hoặc vượt quota, có thể phát sinh phí Google. Không có bảo đảm miễn phí vô hạn.
- **Lưu ý quyền riêng tư:** Nội dung gửi qua Free Tier/unpaid quota có thể được Google dùng để cải thiện sản phẩm và có thể được người đánh giá xử lý. Không tải video có thông tin nhạy cảm hoặc bí mật nếu không chấp nhận điều khoản này.
- Không gửi API key qua chat; hãy nhập trực tiếp trong giao diện website.


## Trích xuất phụ đề cứng (Hardsub OCR · Trang 3)

- Trang 3 đọc phụ đề được đóng trực tiếp trên hình video bằng Tesseract.js chạy trong trình duyệt/Web Worker. Video không được tải lên backend; việc quét khung hình và tạo SRT diễn ra cục bộ trên thiết bị.
- Cho phép chọn vùng OCR bằng cách kéo khung trên video hoặc nhập tọa độ X, Y, W, H; có thể phóng to vùng xem trước để căn chữ.
- Chọn ngôn ngữ OCR, khoảng cách lấy mẫu 0,25 / 0,5 / 1 giây, cùng ba cấu hình Nhanh / Cân bằng / Chất lượng.
- Hỗ trợ ngưỡng thích nghi (adaptive threshold) và Otsu để tăng khả năng đọc chữ trên nền video sáng/tối khác nhau.
- Tối ưu bằng cách tái sử dụng kết quả OCR cho các khung hình gần như giống nhau; kết quả vẫn được đưa vào timeline để xác định thời gian phụ đề.
- Làm mượt timeline: lùi thời điểm bắt đầu 120 ms, ưu tiên thời lượng đọc tối thiểu 1,1 giây khi không bị câu tiếp theo chặn, nối khoảng trống không quá 250 ms và nhắm tốc độ đọc 18 ký tự/giây. Mốc thời gian được giới hạn trong độ dài video và tránh chồng lấn câu kế tiếp.
- Thanh tiến trình đồng bộ giao diện Trang 1: hiển thị phần trăm, số khung hình đã quét / tổng số và số khung hình còn lại; trạng thái tải mô hình, khung lỗi và khung hình được tái sử dụng vẫn được thông báo riêng.
- Có thể khai báo từ điển sửa lỗi OCR theo mẫu `từ sai => từ đúng`; ứng dụng chỉ thay thế cụm khớp rõ ràng, không tự đoán những ký tự dễ nhầm.

## Model hiện hỗ trợ

| Nhà cung cấp | Model ID |
|---|---|
| OpenAI | gpt-6-luna, gpt-6.1-terra |
| Gemini (tất cả người dùng) | gemini-3.5-flash-lite |
| Gemini Speech-to-Text (Trang 2) | gemini-3.5-transcribe |

SubLingo đã tắt Gemini 3.8 Flash; chỉ bật Gemini 3.5 Flash-Lite cho tất cả người dùng. Gemini 3.5 Flash-Lite hỗ trợ bốn mức suy luận MINIMAL, LOW, MEDIUM và HIGH. Mặc định là MINIMAL để ưu tiên tốc độ và tiết kiệm; mức cao hơn có thể cần thêm thời gian và token, đồng thời có thể ảnh hưởng hạn mức hoặc chi phí API theo cấu hình tài khoản Google. Mô hình này có Free Tier trong hạn mức Google, nhưng dự án đã liên kết billing vẫn có thể chịu giá Paid Tier. Muốn tránh phí, hãy xác nhận Google Cloud project/API key đang ở Free Tier và chưa bật billing; theo dõi Usage and Billing trong Google AI Studio.


Third-party license information: see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

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

Endpoint trả về trạng thái cùng phiên bản hiện tại, ví dụ {"ok":true,"service":"sublingo-api","version":"1.2.17"}.

## Đưa lên Render

1. Kết nối repository GitHub với Render và tạo Web Service (Build Command `npm install`, Start Command `npm start`).
2. Trong **Environment** của Render, đặt `GOOGLE_CLIENT_ID` bằng OAuth Client ID loại **Web application**. Giữ `SESSION_SECRET` là chuỗi ngẫu nhiên dài đã tạo cho service.
3. Trong Google Cloud Console, thêm `https://sublingo-srt-translator.onrender.com` vào **Authorized JavaScript origins** của OAuth Client ID. Ứng dụng dùng Google Identity Services popup nên không cần redirect URI.
4. Lưu cấu hình và chờ Render khởi động lại service. Khi chưa có `GOOGLE_CLIENT_ID`, nút đăng nhập sẽ hiển thị trạng thái đang chờ cấu hình; đây không phải lỗi tài khoản Google.
5. Ứng dụng hiện hỗ trợ **đăng nhập bằng Google**, chưa có đăng ký email/mật khẩu riêng. Phiên đăng nhập được lưu bằng cookie HttpOnly trong 7 ngày; ứng dụng chưa lưu hồ sơ người dùng hoặc lịch sử dịch vào database.
4. Sau khi deploy, kiểm tra /api/health và xác nhận trường version là 1.2.17. Bản cài đặt cần tải thêm binary FFmpeg từ package ffmpeg-static.

## Cấu hình API key

Người dùng nhập OpenAI API key hoặc Gemini API key trong giao diện. Key chỉ được gửi qua HTTPS trong request dịch và chuyển tiếp tới nhà cung cấp tương ứng; không ghi key vào file, database, session hay log của ứng dụng. Nếu người dùng bấm “Lưu key trên thiết bị”, trình duyệt lưu key trong localStorage để dùng sau khi tải trang. localStorage không mã hóa key nên không bật tùy chọn này trên máy tính dùng chung. Người dùng chịu phí API của tài khoản nhà cung cấp của mình.

## Bảo mật và vận hành

- Website public phải dùng HTTPS.
- Không commit .env, API key, OAuth client secret hoặc SESSION_SECRET vào GitHub.
- Đổi SESSION_SECRET sẽ làm hết hiệu lực các phiên đăng nhập hiện tại.
- Giao diện chia file thành các nhóm tối đa 60 cue và 24.000 ký tự mỗi request; mỗi cue tối đa 5.000 ký tự. Gemini 3.5 Flash-Lite nhận mức suy luận do người dùng chọn (MINIMAL/LOW/MEDIUM/HIGH), mặc định MINIMAL; giới hạn khoảng cách tối thiểu 4,5 giây giữa thời điểm bắt đầu hai request. Khoảng chờ chỉ được áp dụng khi cần, không cộng thêm sau một phản hồi vốn đã chậm.
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

### 1.2.17
- Đồng bộ thanh tiến trình OCR Trang 3 với giao diện Trang 1.
- Hiển thị phần trăm, số khung hình đã quét / tổng số và số khung hình còn lại.
- Bổ sung trạng thái truy cập được cho trình đọc màn hình; giữ thông báo tải mô hình, khung hình lỗi và khung hình tĩnh được tái sử dụng.

### 1.2.16
- Làm mượt mốc thời gian phụ đề OCR: bù đầu câu 120 ms, thời lượng đọc mục tiêu tối thiểu 1,1 giây khi không bị câu sau chặn.
- Nối khoảng trống nhỏ tối đa 250 ms và điều chỉnh theo mục tiêu 18 ký tự/giây; không để câu trước chồng lên câu kế tiếp hoặc vượt độ dài video.

### 1.2.15
- Thêm cấu hình OCR Nhanh / Cân bằng / Chất lượng, điều chỉnh kích thước ảnh xử lý theo cấu hình.
- Bổ sung ngưỡng thích nghi và Otsu để xử lý nền video sáng/tối.
- Nhận diện khung hình gần như trùng lặp để tái sử dụng kết quả OCR, giảm số lần gọi nhận dạng; giữ xử lý trong một Web Worker để hạn chế chiếm dụng bộ nhớ.

### 1.2.2
- Chuyển nhận diện giọng nói Trang 2 từ OpenAI sang Google Gemini 3.5 Transcribe.
- Dùng chung API key Gemini đã lưu ở Trang 1.
- Tự chờ và thử lại khi Google giới hạn tốc độ; dừng khi hết quota ngày.
- Xóa tệp âm thanh tạm trên Google sau khi nhận diện.


### 1.2.1
- Chuyển mô hình nhận diện giọng nói sang gpt-transcribe, vẫn giữ timestamp từng từ.

### 1.2.0
- Thêm Trang 2 tạo phụ đề tự động từ video bằng OpenAI gpt-transcribe với timestamp từng từ.
- Thêm tách/lọc âm thanh cơ bản bằng FFmpeg, tiến độ xử lý, xem trước video, chỉnh sửa câu phụ đề và xuất SRT.
- Video và âm thanh tạm được xóa sau khi xử lý; bổ sung giới hạn dung lượng và giới hạn lượt gọi.

### 1.1.6
- Đổi nhãn nút Trang 1 thành “Dịch phụ đề SRT” để nêu rõ chức năng đang có.
- Giữ nguyên Trang 2 trống và toàn bộ cách chuyển trang.

### 1.1.5
- Thêm hai nút chuyển Trang 1 / Trang 2 nằm ngang giữa phần giới thiệu và khối tải video.
- Giữ toàn bộ tính năng hiện có trên Trang 1; Trang 2 để trống hoàn toàn.

### 1.1.4
- Thêm tùy chọn suy luận MINIMAL, LOW, MEDIUM, HIGH cho Gemini 3.5 Flash-Lite.
- Lưu lựa chọn suy luận trong trình duyệt; mặc định MINIMAL.
- Backend kiểm tra giá trị hợp lệ và gửi đúng mức người dùng chọn tới Gemini.

### 1.1.3
- Gỡ Gemini 3.8 Flash khỏi giao diện và từ chối model này ở backend.
- Chỉ giữ Gemini 3.5 Flash-Lite cho mọi người dùng; chuẩn hóa thinking MINIMAL và nhịp gửi 4,5 giây.
- Ghi rõ lưu ý Free Tier và cấu hình billing của Google.

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
