# QA & Web3 Security Review — 2026-11-14

## Phạm vi và phương pháp

Rà soát frontend, API, contract, cấu hình và hướng dẫn chạy. Thực thi React trong Microsoft Edge headless; FastAPI dùng SQLite tạm qua Alembic; Hardhat deploy bytecode và xử lý giao dịch local thật. Không thay database phát triển, không triển khai contract hoặc gửi giao dịch trên mạng công khai.

## Lỗi đã sửa

| Vấn đề | Bản sửa và kiểm chứng |
| --- | --- |
| Metadata upload tự thêm UUID tài khoản người nhận vào IPFS công khai | Bỏ `recipient_id` khỏi frontend; backend chỉ nhận các trait công khai `event_id`, `certificate_type`, `achievement`. Thêm cảnh báo cho nội dung/ảnh tự nhập. Tests chặn các trait tên/email/điện thoại/password/ví và kiểm tra payload trước pinning. |
| Giao diện báo thu hồi thành công khi RPC vẫn trả chứng nhận issued/pending | Chỉ báo thành công khi backend trả `revoked`; xóa thông báo tiến trình cũ khi lỗi. E2E bảo đảm không báo thành công hoặc phát thêm giao dịch khi sync pending. |
| Ví/mạng thay đổi giữa chuẩn bị và gửi revoke | Kiểm tra lại account và chain ngay trước broadcast, tương tự mint. |
| RPC error có sai kiểu hoặc timestamp uint256 quá lớn có thể gây lỗi nội bộ | Trả lỗi gateway có cấu trúc, giữ record pending và không lưu token. Thêm kiểm thử hồi quy upstream độc hại. |
| Chuyển đổi ngày không hợp lệ nằm ngoài khối bắt lỗi form sự kiện | Đưa chuyển đổi vào try/finally, để error hiển thị và busy luôn được giải phóng. |
| Organizer thiếu thao tác thêm từng tài khoản dù API đã hỗ trợ | Thêm form UUID, trạng thái busy và xử lý lỗi; thêm nút đóng chi tiết người tham gia. E2E kiểm tra thao tác thật và điểm danh. |
| Đối chiếu blockchain thiếu trạng thái đang xử lý | Hiện “Đang đối chiếu…” trong lúc chờ. |
| Toast đăng nhập che nút chuyển mạng; hover giữ toast tồn tại và chặn click | Thông báo không tương tác dùng pointer-events none. Trace Playwright xác định toast chặn nút; kiểm tra lại bằng click thật, không force click. |
| E2E chỉ tìm Python trong backend/.venv | Hỗ trợ `PYTHON`, backend/.venv và .venv tại gốc; điều chỉnh timeout cho cold Vite và RPC, không bỏ assertion. |
| Smoke test giữ SQLite mở trên Windows | Dừng cây tiến trình Uvicorn do test tạo, thay vì chỉ dừng venv launcher. Chạy lại HTTP smoke thành công với exit code 0 và cleanup hoàn tất. |
| Dependencies có advisory | Vá React Router 7.18.5, FastAPI 0.162.7, Starlette 1.3.1, PyJWT 2.15.0, python-multipart 0.0.31, python-dotenv 1.2.2, pytest 9.0.3; cập nhật overrides tương thích cho bn.js, cookie, diff, glob, minimatch. |
| Tài liệu cũ ghi đường dẫn máy khác và dữ liệu minh họa | Viết README gốc, sửa README frontend/blockchain và hướng dẫn role API/on-chain, local RPC, QR, E2E. Bổ sung gitignore cho môi trường và đầu ra test. |

## Kết quả thực thi

| Kiểm tra | Kết quả đã quan sát |
| --- | --- |
| `frontend: npm.cmd run build` | PASS, production bundle tạo thành công sau các bản sửa |
| `frontend: npm.cmd run lint` | PASS |
| `backend: python -m pytest -q` | **118 passed** trên dependencies đã vá; 2 deprecation warnings của TestClient/AnyIO |
| `backend: python -m ruff check .` | PASS |
| `backend: python -m ruff format --check .` | PASS, 58 files |
| `backend: python scripts/smoke_test.py` | PASS, 22 kiểm tra HTTP thật, exit 0, SQLite tạm được dọn |
| `blockchain: npm.cmd test` | **102 passing**, gồm 91 contract tests và 11 deployment guards, sau khi vá toolchain |
| `blockchain: npm.cmd run test:integration` | PASS, deploy/mint/receipt/live state/revoke qua JSON-RPC và Python verifier |
| `frontend: npm.cmd run test:e2e` | **34 passed (2.1m)**, exit 0 trên dependencies backend đã vá, retries=0 |
| Frontend routes/responsive | PASS các route công khai, route tài khoản và 404 ở 390/1280 px; không có pageerror hoặc tràn ngang trong flow |
| `frontend: npm audit` | 0 vulnerabilities sau vá React Router |
| `blockchain: npm audit` | 16 low, 0 moderate/high/critical sau vá; xem giới hạn dưới đây |
| `backend: pip-audit -r requirements-dev.txt` | Không tìm thấy advisory, bao gồm dependencies gián tiếp do resolver chọn |
| `backend: python scripts/check_credentials.py` | PASS kiểm tra private-key/JWT assignment trong tệp Git theo dõi ngoài test, không in giá trị bí mật |
| VS Code Problems | Không có lỗi được báo trong frontend source/backend app |

## Luồng E2E đã thực hiện

- Tạo tài khoản qua API đăng ký; Admin đăng nhập và cấp Organizer bằng API được bảo vệ. Chưa có trang quản trị tài khoản riêng.
- Organizer đăng nhập trên giao diện, tạo tổ chức, kiểm tra lỗi ngày kết thúc trước ngày bắt đầu, tạo sự kiện hợp lệ, thêm Participant và điểm danh attended.
- Participant trong browser context riêng kết nối provider ví và liên kết ví qua giao diện Hồ sơ.
- Organizer cấp chứng nhận qua BrowserProvider; EVM local mint SBT và backend đọc receipt thật rồi chuyển issued. Participant xem chứng nhận theo tài khoản/ví.
- Browser context công khai không có JWT tải ảnh QR và nhận VALID. Organizer ký giao dịch revoke; quét lại cùng QR nhận REVOKED.
- Các flow khác kiểm tra thiếu ví, từ chối kết nối/giao dịch, sai mạng, thiếu gas, mất hash, retry, metadata lỗi, chống cấp trùng, QR không liên quan, camera bị từ chối, video camera QR, PDF, history và token không có bản ghi SQLite.

## Phân quyền và bảo mật đã kiểm tra

Backend tests bao phủ JWT sai/hết hạn/bị thu hồi, role injection, Participant không được quản lý, Organizer không được truy cập chéo tổ chức, bảo vệ Admin cuối cùng, CRUD sự kiện, registration trùng, CSV nguyên tử, attendance, duplicate issuance, khóa mint đồng thời, xác minh receipt/log/contract/chain/confirmations và privacy của response công khai. Mật khẩu dùng bcrypt; không lưu plaintext hoặc đưa password_hash vào response.

Contract tests bao phủ quyền mint, cấp/gỡ/renounce role, zero address, input quá dài/rỗng, token 0, cấp trùng qua Organizer khác và sau revoke, mọi overload transfer, self-transfer, approvals, burn nội bộ, quyền revoke của issuer/admin, Organizer không liên quan, receiver từ chối và nested/cross-function reentrancy. Không phát hiện lỗi contract trong các trường hợp đã chạy; không sửa Solidity hoặc yêu cầu redeploy.

## Giới hạn còn lại

1. Provider EIP-1193 trong E2E được điều khiển tự động, giao dịch chạy trên EVM local. Chưa chạy extension MetaMask thật, ký tay trên Sepolia, camera vật lý, RPC production hoặc upload Pinata thật. Metadata test dùng fixture; không tuyên bố những tích hợp này đã thành công.
2. Liên kết địa chỉ ví chưa yêu cầu chữ ký chứng minh sở hữu. Không được coi đây là xác thực ví hoặc xác thực danh tính. Địa chỉ ví và URI metadata vốn công khai trên chain; nội dung IPFS người dùng tự nhập vẫn cần được quản trị kiểm soát.
3. Contract cấp Organizer toàn cục, chưa ràng buộc mỗi UUID sự kiện với tổ chức/ví. API kiểm soát tổ chức riêng; quản trị cần cấp role on-chain đúng người. Hệ thống chưa có UI quản trị tài khoản; dùng API/Swagger để cấp Organizer.
4. Còn 16 advisory low trong nhánh toolchain Hardhat 2/elliptic. Elliptic không có bản vá tương thích trong nhánh này; npm đề xuất chuyển Hardhat 3 cùng plugin major. Đây là dependency phát triển/deploy, không được đưa vào frontend bundle hoặc bytecode Solidity; không tuyên bố toàn repository không có CVE.
5. Audit môi trường Python cũ còn phát hiện gói dư ngoài requirements (như python-jose/ecdsa và pip cũ). Không xóa package có sẵn của người dùng. Nên tạo môi trường mới từ requirements đã vá; kết quả audit requirements và audit toàn môi trường là hai phạm vi khác nhau.
6. Credential scanner là kiểm tra mẫu trong working tree được Git theo dõi; bỏ qua fixture test có key công khai. Không thay thế kiểm tra lịch sử Git hay dịch vụ secret scanning. Không đọc hoặc xuất nội dung các file .env hiện có.
7. Không tuyên bố mọi tổ hợp thiết bị, mọi button/state hoặc toàn bộ khả năng tấn công đã được bao phủ. Các kết quả trên gắn với những test và kích thước được nêu, không phải chứng nhận an toàn production.
