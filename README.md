# SBT Certificate System / SoulPass

Ứng dụng cấp chứng nhận Soulbound gồm React/Vite, FastAPI/SQLite và Solidity/OpenZeppelin. Chứng nhận không chuyển nhượng được; thu hồi giữ nguyên token và lịch sử. Frontend gọi API thật; backend xác nhận giao dịch bằng receipt, event logs, chain ID, contract và trạng thái token.

## Yêu cầu

- Node.js 22+ (Hardhat 2), npm; trên Windows PowerShell dùng `npm.cmd` nếu execution policy chặn `npm.ps1`.
- Python 3.11+; Microsoft Edge trên Windows để chạy E2E. Linux/macOS cần Chromium của Playwright.
- MetaMask, RPC và contract đã deploy để thao tác giao dịch thủ công. Backend không giữ private key và không ký giao dịch.

## Khởi chạy từ thư mục gốc

### Backend

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r backend/requirements-dev.txt
# Chỉ copy khi chưa có file cấu hình, không ghi đè secrets hiện có.
Copy-Item backend/.env.example backend/.env
.\.venv\Scripts\python.exe -c "import secrets; print(secrets.token_urlsafe(48))"
```

Điền giá trị ngẫu nhiên vừa sinh vào `SECRET_KEY` trong `backend/.env`, rồi:

```powershell
cd backend
..\.venv\Scripts\python.exe -m alembic upgrade head
..\.venv\Scripts\python.exe seed.py
..\.venv\Scripts\python.exe -m uvicorn main:app --host 127.0.0.1 --port 8000
```

API docs: <http://127.0.0.1:8000/docs>. Demo phát triển: `admin@example.com`, `organizer@example.com`, `participant@example.com`, mật khẩu `DemoSBT2026!`. Seed bị chặn trong production. Dùng `python -m app.cli create-admin` với tham số theo [backend/README.md](backend/README.md) để tạo admin riêng; thay mật khẩu demo trước khi đưa hệ thống ra ngoài.

### Frontend (terminal khác)

```powershell
cd frontend
npm.cmd ci
# Chỉ copy nếu chưa có .env.
Copy-Item .env.example .env
npm.cmd run dev
```

Mở <http://localhost:5173>. `CORS_ORIGINS` của backend phải khớp origin của trình duyệt. `PUBLIC_FRONTEND_URL` phải là origin mà người quét QR truy cập được; `localhost` trên điện thoại là điện thoại đó, không phải máy chạy backend.

### Blockchain local (hai terminal)

```powershell
cd blockchain
npm.cmd ci
npm.cmd run node
```

Terminal khác trong `blockchain`:

```powershell
npm.cmd run deploy:local
npx.cmd hardhat console --network localhost
```

Trong console, admin cấp quyền cho địa chỉ ví Organizer:

```javascript
const deployment = require('./deployments/localhost.json')
const contract = await ethers.getContractAt('SoulboundCertificate', deployment.contractAddress)
await contract.grantRole(await contract.ORGANIZER_ROLE(), '0xYOUR_ORGANIZER_WALLET')
```

Cấu hình backend: `WEB3_PROVIDER_URL=http://127.0.0.1:8545`, `CHAIN_ID=31337`, `SBT_CONTRACT_ADDRESS=<địa chỉ đã deploy>`, `MIN_CONFIRMATIONS=1` cho local automine. Cấu hình frontend tương ứng: `VITE_RPC_URL`, `VITE_CHAIN_ID`, `VITE_CHAIN_NAME`, `VITE_SBT_CONTRACT_ADDRESS`. Khởi động lại backend/Vite sau khi đổi môi trường. Thêm mạng local vào MetaMask và nạp ETH phát triển cho ví thử nghiệm. Các tài khoản Hardhat công khai chỉ dùng trên chain local; không dùng cho tài sản thật.

Deploy Sepolia, preflight và giới hạn chi phí: [blockchain/README.md](blockchain/README.md). Các test tự động không phát giao dịch ra mạng công khai.

## Luồng sử dụng

1. Đăng ký tài khoản Participant. Admin đăng nhập và cấp Organizer bằng `PATCH /api/v1/users/{id}` với `{"role":"organizer"}` trong Swagger/API. Hiện chưa có màn hình quản trị tài khoản riêng.
2. Admin của contract cấp `ORGANIZER_ROLE` cho ví ký giao dịch. Quyền tài khoản API và quyền ví trên contract độc lập.
3. Organizer đăng nhập, tạo tổ chức và sự kiện đang mở; thêm tài khoản qua mã UUID hoặc CSV `email`/`user_id`, rồi điểm danh `attended`.
4. Participant đăng nhập, kết nối MetaMask và liên kết địa chỉ tại Hồ sơ. Organizer tải lại danh sách người nhận sau thay đổi ví.
5. Organizer chọn người nhận và metadata IPFS, xác nhận mint trong MetaMask. Chỉ sau khi backend xác minh bằng RPC, chứng nhận mới chuyển từ pending sang issued.
6. Participant xem bộ sưu tập bằng tài khoản và ví tương ứng, tải PDF/QR. Người xem không cần đăng nhập để quét QR hoặc xác thực contract/token.
7. Organizer là người đã mint hoặc admin contract xác nhận thu hồi on-chain. Quét lại cùng QR trả `REVOKED` sau khi đủ confirmations. API `/revoke` riêng là thu hồi registry, không tự gửi giao dịch; giao diện dùng giao dịch on-chain.

Nếu mất kết nối sau khi gửi mint, dùng Đồng bộ; không tạo record mới. Backend có worker phục hồi hash từ event logs, khóa lần mint và unique constraint chống cấp trùng. Token ID giữ dưới dạng chuỗi uint256, bao gồm token 0.

## Routes

| Route | Truy cập |
| --- | --- |
| `/`, `/login`, `/register`, `/forgot-password`, `/verify` | Công khai |
| `/events`, `/my-certificates`, `/profile` | Đã đăng nhập |
| `/dashboard`, `/events/new`, `/certificates` | Admin/Organizer |
| Các đường dẫn khác | Trang 404 |

Quên mật khẩu hiện hướng dẫn liên hệ quản trị viên; chưa tích hợp gửi email. Frontend kiểm tra lại phiên bằng `/auth/me`; quyền API luôn đọc từ database. Mật khẩu dùng bcrypt, JWT có thời hạn và bị vô hiệu hóa khi logout/đổi quyền/đổi mật khẩu.

## Kiểm thử

Chạy từ gốc, với dependencies đã cài:

```powershell
cd frontend
npm.cmd run build
npm.cmd run lint
npm.cmd run test:e2e
cd ../backend
..\.venv\Scripts\python.exe -m pytest -q
..\.venv\Scripts\python.exe -m ruff check .
..\.venv\Scripts\python.exe scripts/smoke_test.py
cd ../blockchain
npm.cmd test
$env:PYTHON = (Resolve-Path ../.venv/Scripts/python.exe).Path
npm.cmd run test:integration
```

E2E tự tạo database tạm, deploy contract trên Hardhat tại `18545`, RPC proxy `18546`, FastAPI `8011`, Vite `5178`; các cổng phải trống. Runner chọn `PYTHON` nếu được đặt, sau đó `backend/.venv`, sau đó `.venv` tại gốc. Dùng `npm ci` cả frontend/blockchain trước khi chạy. Không dùng database hoặc server phát triển hiện có.

E2E chạy trình duyệt thật và giao dịch EVM local thật, với provider EIP-1193 được điều khiển tự động. Không cài/mở extension MetaMask thật, không dùng ETH Sepolia, không gọi Pinata thật; metadata test được phục vụ bằng fixture. Camera test dùng video QR giả lập; xác thực QR từ ảnh vẫn qua decoder thật. Vì vậy kết quả tự động không chứng minh popup extension, camera vật lý hoặc cấu hình production đã được kiểm tra.

## Bảo mật và dữ liệu công khai

Lần kiểm chứng 2026-11-14: build/lint đạt, backend **118 passed**, contract/deployment guards **102 passing**, E2E **34 passed**, smoke HTTP và integration RPC đạt. Các test có giới hạn được mô tả trong [QA_REPORT.md](QA_REPORT.md); E2E không dùng extension MetaMask thật.

- Không đưa private key, seed phrase, JWT ký backend hoặc Pinata token vào `VITE_*`; các biến này xuất hiện trong bundle trình duyệt. File `.env` được gitignore.
- Backend chỉ xác minh blockchain qua RPC cố định trong cấu hình; không nhận RPC URL từ người dùng.
- On-chain lưu UUID sự kiện, địa chỉ ví, URI metadata và hash; không lưu tên/email/số điện thoại người nhận. Metadata IPFS cũng công khai: không nhập dữ liệu cá nhân vào tên, mô tả, ảnh hoặc tài liệu được pin. API attributes chỉ nhận `event_id`, `certificate_type`, `achievement`, không nhận thuộc tính định danh người nhận.
- Liên kết địa chỉ ví hiện kiểm tra định dạng và tính duy nhất; chưa có chữ ký chứng minh sở hữu. Đây không phải đăng nhập bằng ví và không chứng minh danh tính ngoài đời.
- Xác thực công khai trả địa chỉ ví và URI vốn đã công khai trên chain. PDF có tên người nhận chỉ tải qua API được phân quyền.
- Contract có quyền Organizer toàn cục; không có allowlist sự kiện theo tổ chức trên chain. API vẫn kiểm tra quyền quản lý từng tổ chức. Việc gắn tổ chức với ví on-chain là trách nhiệm quản trị khi cấp role.

Kiểm tra credential trong các tệp được Git theo dõi (không in giá trị bí mật): `python backend/scripts/check_credentials.py`. Script không quét lịch sử Git hoặc thay thế dịch vụ secret scanning.

Kết quả lần rà soát và các giới hạn còn lại: [QA_REPORT.md](QA_REPORT.md). API/schema chi tiết: [backend/README.md](backend/README.md).
