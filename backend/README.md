# SBT Certificate System Backend

Backend Python 3.11+ sử dụng FastAPI, SQLAlchemy 2, SQLite, Pydantic 2, JWT HS256 và bcrypt. API có router, service, model, schema riêng; quản lý schema bằng Alembic.

## Có cần MetaMask? Dữ liệu có bị gán cứng không?

- Đăng nhập, tạo sự kiện, đăng ký và điểm danh dùng API + SQLite thật; không cần MetaMask.
- Cấp/thu hồi SBT on-chain cần ví ký giao dịch, giao diện hiện tại dùng MetaMask. Organizer trả gas; người nhận chỉ cần cung cấp ví để nhận SBT. Bộ sưu tập trên web yêu cầu kết nối ví để lọc chứng nhận. Tra cứu công khai không cần ví.
- `seed.py` là bước **tùy chọn** để tạo tài khoản/tổ chức/sự kiện demo trong database. Seed không gán địa chỉ ví, không tạo chứng nhận có CID mẫu và không tạo giao dịch blockchain.
- Địa chỉ contract toàn số 0 là chỗ trống cấu hình, chưa thể mint. Phải deploy contract, cấu hình cùng chain/contract ở frontend và backend, rồi cấp `ORGANIZER_ROLE` cho ví ký. Xem [hướng dẫn kết nối MetaMask và chạy local](../frontend/README.md#kết-nối-metamask-và-cấp-sbt-thật-trên-hardhat-local).

## Chạy trên Windows / PowerShell

Từ thư mục dự án:

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements-dev.txt
Copy-Item .env.example .env
.\.venv\Scripts\python.exe -c "import secrets; print(secrets.token_urlsafe(48))"
```

Điền giá trị vừa sinh vào `SECRET_KEY` trong `.env`. Nếu môi trường đã được thiết lập sẵn, giữ nguyên `.env` hiện có.

```powershell
.\.venv\Scripts\python.exe -m alembic upgrade head
# Tùy chọn: chỉ chạy nếu muốn có dữ liệu demo.
.\.venv\Scripts\python.exe seed.py
.\.venv\Scripts\python.exe -m uvicorn main:app --host 127.0.0.1 --port 8000
```

- Swagger: http://127.0.0.1:8000/docs
- ReDoc: http://127.0.0.1:8000/redoc
- Health: http://127.0.0.1:8000/health
- API base: `http://localhost:8000/api/v1`
- Database mặc định: `backend/sbt_certificates.db`, không phụ thuộc thư mục chạy lệnh.
- Server kiểm tra phiên bản schema khi khởi động; cần chạy migration trước.

Seed chạy nhiều lần không tạo bản ghi trùng hoặc đặt lại mật khẩu tài khoản có sẵn. Seed bị vô hiệu trong `APP_ENV=production`.

| Tài khoản demo | Vai trò |
| --- | --- |
| admin@example.com | Admin |
| organizer@example.com | Organizer |
| participant@example.com | Participant |

Mật khẩu demo cho cả ba: `DemoSBT2026!`. Seed có tổ chức, hai sự kiện và người tham gia. Người dùng tự liên kết ví trong Hồ sơ, sau đó Organizer cấp chứng nhận với metadata IPFS thật.

Nếu đã chạy seed phiên bản cũ, ví `0x111…` và chứng nhận pending có CID mẫu vẫn nằm trong database; seed mới giữ nguyên dữ liệu đã tồn tại. Đổi sang ví thật trong Hồ sơ và cấp chứng nhận cho một sự kiện mới. Chứng nhận cũ giữ snapshot ví nhận lúc tạo, nên đổi hồ sơ không sửa ví nhận/metadata của record đó.

Để khởi tạo Admin trên database không dùng seed:

```powershell
.\.venv\Scripts\python.exe -m app.cli create-admin --email admin@your-domain.com --name "System Admin"
```

CLI hỏi mật khẩu và xác nhận, không truyền mật khẩu qua tham số dòng lệnh. API đăng ký luôn tạo Participant. Admin cấp Organizer qua `PATCH /api/v1/users/{id}`.

## Đăng nhập và tích hợp frontend

Đăng nhập JSON:

```http
POST /api/v1/auth/login
Content-Type: application/json

{"email":"participant@example.com","password":"DemoSBT2026!"}
```

Response gồm `access_token`, `token_type`, `expires_in`, `user`. Gửi `Authorization: Bearer <access_token>` ở các request bảo vệ.

Swagger có nút **Authorize**, sử dụng email ở trường username. Endpoint `POST /auth/token` chấp nhận OAuth2 form.

`POST /auth/logout` thu hồi toàn bộ access token hiện có của tài khoản bằng `token_version`; frontend cũng cần xóa token khỏi storage/store. Đổi mật khẩu, đổi quyền hoặc vô hiệu tài khoản cũng thu hồi token cũ. Token mặc định hết hạn sau 60 phút, không có refresh token. Quyền luôn được đọc lại từ database, không dùng role trong request hay JWT làm nguồn cấp quyền.

Frontend có trang đăng nhập tại `http://localhost:5173/login`, gọi API đăng nhập và lưu token ở `sbt_access_token`. Admin/Organizer được chuyển tới dashboard, Participant tới bộ sưu tập. Khi tải lại trang, frontend xác nhận phiên qua `/auth/me`; nút đăng xuất gọi `/auth/logout` và xóa token. Chi tiết tại [frontend/README.md](../frontend/README.md).

Backend sử dụng tài khoản email/mật khẩu. Các URL nonce/signature của khung đăng nhập ví cũ không còn là API xác thực. Liên kết ví chỉ xác nhận định dạng địa chỉ, không xác minh sở hữu ví và không cho phép đăng nhập bằng địa chỉ đó.

`CORS_ORIGINS` mặc định chỉ cho `http://localhost:5173`. Nếu mở frontend qua IP hoặc port khác, cấu hình đúng origin. Không chấp nhận wildcard.

## Quyền truy cập

| Thao tác | Participant | Organizer | Admin |
| --- | --- | --- | --- |
| Xem/sửa hồ sơ và ví của mình | Có | Có | Có |
| Liệt kê tài khoản, đổi quyền, khóa tài khoản | Không | Không | Có |
| Tạo tổ chức | Không | Có | Có |
| Sửa tổ chức, quản lý sự kiện | Không | Owner hoặc organizer của tổ chức | Mọi tổ chức |
| Thêm/sửa/xóa thành viên tổ chức | Không | Owner của tổ chức | Mọi tổ chức |
| Đăng ký sự kiện đang mở | Có | Có | Có |
| Xem danh sách tham dự | Chỉ bản ghi của mình | Tổ chức được quản lý | Tất cả |
| Xác nhận tham dự, cấp/thu hồi chứng nhận | Không | Tổ chức được quản lý | Tất cả |
| Xem chứng nhận quản lý | Của mình | Của mình và tổ chức được quản lý | Tất cả |
| Xem audit log | Không | Không | Có |
| Xác thực công khai | Không cần đăng nhập | Không cần đăng nhập | Không cần đăng nhập |

Một tài khoản phải có **cả global role Organizer và membership organizer** để được ủy quyền quản lý tổ chức, trừ owner/Admin. Owner chỉ có thể thêm người đã được Admin cấp Organizer vào vị trí quản lý. Membership không tự nâng global role. Không thể xóa/hạ quyền membership của owner. Admin cuối cùng đang hoạt động được bảo vệ khỏi khóa/hạ quyền, kể cả khi có request đồng thời.

## API

Mọi đường dẫn dưới đây có prefix `/api/v1`. Response danh sách có dạng `{items, total, skip, limit}`; `skip >= 0`, `1 <= limit <= 100`.

| Nhóm | Endpoint |
| --- | --- |
| Auth | `POST /auth/register`, `POST /auth/login`, `POST /auth/token`, `GET /auth/me`, `POST /auth/logout` |
| User | `GET/PATCH /users/me`, `PUT /users/me/wallet`, `PUT /users/me/password`, `GET /users`, `GET/PATCH /users/{id}` |
| Organization | `POST/GET /organizations`, `GET/PATCH /organizations/{id}` |
| Membership | `GET/POST /organizations/{id}/members`, `PATCH/DELETE /organizations/{id}/members/{user_id}` |
| Event | `POST/GET /events`, `GET/PATCH/DELETE /events/{id}`, `POST /events/{id}/close` |
| Participant | `POST /events/{id}/register`, `GET/POST /events/{id}/participants`, `POST /events/{id}/participants/import`, `PATCH /events/{id}/participants/{participant_id}` |
| Certificate | `POST /certificates/issue`, `POST /certificates/issue/batch`, `GET /certificates`, `GET /certificates/{id}` |
| Lifecycle | `PATCH /certificates/{id}/transaction`, `POST /certificates/{id}/confirm`, `POST /certificates/{id}/fail`, `POST /certificates/{id}/retry`, `POST /certificates/{id}/revoke` |
| Verification | `GET /verify/certificate/{id}`, `GET /verify/token/{token_id}` |
| Audit | `GET /audit-logs` |
| IPFS tùy chọn | `POST /ipfs/upload/metadata` |

Swagger có schema request/response và mã lỗi cho từng endpoint.

Danh sách sự kiện hỗ trợ `q`, `status`, `organization_id`, `start_from`, `start_to`. Thời gian đầu vào bắt buộc có timezone và được lưu/trả về UTC. Draft chỉ hiện cho người quản lý và Admin.

Trạng thái event: `draft → active → closed → completed`; có thể hủy thành `cancelled` trước khi hoàn tất. Sự kiện active có thể chuyển thẳng completed. Không mở lại sự kiện đã đóng, không sửa sự kiện đã completed/cancelled. Chỉ xóa draft chưa có người tham gia; dùng close cho sự kiện đã có lịch sử. Đăng ký yêu cầu active và chưa qua end_date. Mỗi cặp event/user chỉ có một registration.

Trạng thái tham dự: `registered`, `confirmed`, `attended`, `absent`, `cancelled`. Chỉ `attended` mới đủ điều kiện cấp chứng nhận. Không thể bỏ attendance khi chứng nhận đang pending/issued.

## CSV

Gửi multipart với field `file` đến `POST /events/{event_id}/participants/import`. CSV UTF-8 (hỗ trợ BOM), cột `email` và/hoặc `user_id`. Tài khoản phải tồn tại và đang hoạt động. Nếu gửi cả hai cột, chúng phải trỏ tới cùng tài khoản.

Ví dụ: [examples/participants.csv](examples/participants.csv).

Giới hạn mặc định 1 MiB / 1.000 dòng. Dòng lỗi, trùng trong file hoặc đã đăng ký đều hủy toàn bộ lần nhập. CSV không tạo mật khẩu hay tài khoản ngầm.

## Chứng nhận và blockchain

Tạo pending:

```json
{
  "event_id": "<UUID sự kiện>",
  "recipient_id": "<UUID người đã attended và có ví>",
  "token_uri": "ipfs://<CID>/metadata.json"
}
```

Batch nhận `{"certificates": [ ... ]}`, tối đa 100 phần tử, lưu toàn bộ hoặc hủy toàn bộ. Database có unique constraint `(event_id, recipient_id)`. Retry dùng lại record failed, không tạo chứng nhận thứ hai. Địa chỉ ví người nhận được chụp lại khi tạo record, không đổi khi người dùng cập nhật hồ sơ.

Luồng:

1. `POST /certificates/issue` tạo pending.
2. Minter được cấp quyền trên contract gửi giao dịch `mintCertificate` bằng ví của họ.
3. Có thể lưu hash trước qua `PATCH /certificates/{id}/transaction`.
4. Gửi `{"token_id":"0","tx_hash":"0x...64 ký tự hex..."}` tới `POST /certificates/{id}/confirm`.
5. Backend đọc RPC, kiểm tra chain, receipt thành công, canonical block, số confirmations, contract và log `CertificateIssued` khớp event ID/recipient/token/IPFS URI; đọc trạng thái hiện tại để loại token đã bị revoked. Backend cũng giữ đọc log `CertificateMinted` của contract cũ. Sau đó lưu block, token, contract, hash, issued_at và chuyển issued.
6. Nếu thất bại, manager dùng `/fail` với `{"reason":"..."}`, sau đó `/retry` để xử lý lại.

Token ID dùng **chuỗi thập phân uint256**, hỗ trợ cả token 0 và giá trị lớn hơn khả năng biểu diễn chính xác của JavaScript/SQLite integer. Unique token nằm trong phạm vi `(chain_id, contract_address, token_id)`.

Để xác nhận trên chain, cấu hình và khởi động lại server:

```dotenv
WEB3_PROVIDER_URL=http://127.0.0.1:8545
CHAIN_ID=31337
SBT_CONTRACT_ADDRESS=0x<địa chỉ contract đã deploy>
MIN_CONFIRMATIONS=2
```

Hoặc dùng RPC/chain ID của Sepolia. Contract mới là `blockchain/contracts/SoulboundCertificate.sol`, với hàm `mintCertificate(recipient, eventId, metadataURI, certificateHash)`. Ví ký giao dịch phải được Admin contract cấp `ORGANIZER_ROLE`; quyền JWT không tự cấp quyền on-chain. Không cần private key trong backend; backend không ký hay tự gửi giao dịch mint. Với Hardhat automine, cần đào thêm block để đạt MIN_CONFIRMATIONS, hoặc đặt 1 khi phát triển.

Cấp pending/CRUD không cần RPC. Xác nhận và kiểm tra live trả lỗi rõ ràng nếu thiếu cấu hình hoặc RPC hỏng. Không tin các trường status/block/contract do client tự cung cấp.

`POST /certificates/{id}/revoke` thu hồi tại registry ngay lập tức; không gửi giao dịch `revokeCertificate` on-chain. Khi cần đồng bộ contract, ví có ADMIN_ROLE gửi giao dịch thu hồi riêng.

Verification mặc định báo theo database, `source=database`, `on_chain_verified=false`. Thêm `?on_chain=true` để đọc trạng thái contract hiện tại, gồm việc thu hồi ngoài backend. Nếu chain hỏng, yêu cầu live trả lỗi thay vì dùng kết quả cũ. Khi token ID có ở nhiều contract/chain, cần bổ sung `contract_address` và `chain_id`. Dữ liệu công khai không có email, user ID, wallet, IPFS metadata hay lý do nội bộ.

Upload IPFS metadata là tích hợp Pinata thật, yêu cầu `PINATA_JWT` và role Organizer/Admin; trả 503 khi chưa cấu hình.

## Database, lỗi và kiểm thử

Bảy bảng nghiệp vụ: users, organizations, organization_members, events, participants, certificates, audit_logs. Bảng thành viên bổ sung hỗ trợ quan hệ nhiều người/nhiều tổ chức. SQLite bật foreign_keys trên mỗi connection. Có unique/FK/check constraints, composite FK buộc certificate thuộc người đã đăng ký, index truy vấn và optimistic revision để ngăn request cũ ghi đè thay đổi mới. Audit được lưu cùng transaction với thao tác nghiệp vụ, không lưu mật khẩu/token.

Quản lý migration:

```powershell
.\.venv\Scripts\python.exe -m alembic upgrade head
.\.venv\Scripts\python.exe -m alembic current
.\.venv\Scripts\python.exe -m alembic check
# Khi thay đổi model:
.\.venv\Scripts\python.exe -m alembic revision --autogenerate -m "describe_change"
```

Migrations ban đầu dành cho database mới. Với database từ schema scaffold cũ, cần sao lưu và viết migration chuyển dữ liệu phù hợp; server không tự xóa hay tự stamp schema cũ.

Response lỗi chuẩn:

```json
{"error":{"code":"already_registered","message":"This account is already registered for this event","details":null}}
```

Dùng 401 cho token sai/thiếu/hết hạn, 403 cho thiếu quyền, 404 cho không tìm thấy, 409 cho trùng/chuyển trạng thái sai, 413 cho CSV vượt giới hạn, 422 cho dữ liệu không hợp lệ, 502/503 cho dịch vụ ngoài/database chưa sẵn sàng. Validation errors không trả lại giá trị password từ request. Response user không có password_hash.

```powershell
.\.venv\Scripts\python.exe -m pytest -q
.\.venv\Scripts\python.exe -m ruff check .
.\.venv\Scripts\python.exe -m ruff format --check .
.\.venv\Scripts\python.exe scripts/smoke_test.py
```

Test dùng database tạm được tạo qua Alembic. Có kiểm tra auth, role injection, truy cập chéo tổ chức, CSV atomicity, attendance, vòng đời chứng nhận, dữ liệu RPC sai, privacy, FK/unique/check, request đồng thời, CORS và migration upgrade/downgrade. Smoke test tự mở Uvicorn ở port trống, gọi HTTP thật rồi dừng server và dọn database tạm.

Các test blockchain dùng RPC giả lập có receipt/log ABI để kiểm tra verifier; giao dịch trên mạng Ethereum thực cần RPC/contract triển khai. Smoke test kiểm tra trường hợp chưa cấu hình RPC giữ trạng thái pending.

Tham khảo triển khai: [FastAPI JWT](https://fastapi.tiangolo.com/tutorial/security/oauth2-jwt/), [SQLite foreign keys](https://www.sqlite.org/foreignkeys.html).
