# SoulPass frontend

## Chạy web

Cần backend đang chạy trên cổng 8000. Trong PowerShell:

```powershell
cd D:\Blockchain-NTH\BoLocChan\frontend
npm.cmd install
npm.cmd run dev
```

Mở http://localhost:5173/login. Đăng nhập trực tiếp trên web bằng:

- Admin: `admin@example.com`
- Organizer: `organizer@example.com`
- Participant: `participant@example.com`

Mật khẩu demo chung: `DemoSBT2026!`. Tài khoản demo được tạo bằng `python seed.py` trong backend.

Đăng nhập trên Swagger chỉ đăng nhập cho Swagger, không tạo phiên trên web.

Form web gọi `POST /api/v1/auth/login`. Admin/Organizer vào `/dashboard`, Participant vào `/my-certificates`. Sau khi tải lại trang, web gọi `GET /api/v1/auth/me` để xác nhận tài khoản/vai trò. Có thể đăng xuất bằng nút cạnh tên tài khoản ở cuối thanh bên; web gọi API thu hồi token và xóa phiên trình duyệt. Các tab cùng origin đồng bộ đăng xuất.

Đăng ký luôn tạo Participant. Hồ sơ và địa chỉ ví được đọc/lưu bằng API thật; trường vai trò chỉ đọc. Chỉ Admin cấp quyền Organizer qua API quản trị.

Các trang số liệu/sự kiện/chứng nhận còn dùng dữ liệu minh họa và có nhãn trên giao diện. Chức năng quên mật khẩu hướng dẫn liên hệ quản trị viên; không giả lập gửi email.

API mặc định: `http://localhost:8000/api/v1`. Có thể cấu hình `VITE_API_BASE_URL` trong `.env`. Backend phải cho phép đúng origin frontend trong `CORS_ORIGINS`, ví dụ `http://localhost:5173`.

## Kiểm tra

```powershell
npm.cmd run build
npm.cmd run test:e2e
```

Test E2E khởi động backend với SQLite tạm tại cổng 8011 và Vite tại cổng 5178; không dùng database hoặc token đang sử dụng của bạn. Cần cài dependency backend vào `backend/.venv`.

Trên Windows, test dùng Microsoft Edge đã cài sẵn ở chế độ headless. Có thể đổi bằng `PLAYWRIGHT_CHANNEL=chrome`. Trên Linux/macOS, chạy `npx playwright install chromium` trước khi test.

Test kiểm tra đăng nhập thật, sai mật khẩu, khôi phục phiên, thu hồi token, truy cập theo vai trò, đăng ký, sửa hồ sơ, lỗi kết nối và đồng bộ đăng xuất giữa các tab.
