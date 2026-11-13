# QR, PDF, xác minh blockchain và lịch sử chứng nhận

Các chức năng dùng chung giao diện và component hiện tại. Solidity production
và ABI được giữ nguyên. Migration `0004` bổ sung logo tổ chức, tên người nhận
tại thời điểm chuẩn bị cấp, hash thu hồi đang xử lý và bảng lịch sử.
Các chứng nhận cũ được backfill lịch sử cấp/thu hồi mà không tạo transaction hash giả.

## Sử dụng trên giao diện

1. Trong **Sự kiện**, mở **Logo tổ chức trên chứng nhận PDF** để tải logo PNG/JPEG.
   Logo tối đa 1 MB, được chuẩn hóa thành PNG, bỏ metadata ảnh và thu nhỏ tối đa
   256×256. Khi chưa có ảnh, PDF dùng biểu trưng chữ viết tắt của tổ chức.
2. Cấp chứng nhận bằng luồng MetaMask hiện có.
3. Trong **Chứng nhận**, chọn **Xem chứng nhận**; hoặc mở **Bộ sưu tập** của ví.
   Component dùng chung cung cấp **QR xác thực**, **Tải PDF** và **Lịch sử**.
4. QR có thể tải dưới dạng PNG. Nội dung chỉ là URL:

   ```text
   https://your-frontend.example/verify?chainId=11155111&contractAddress=0x...&tokenId=0
   ```

   Không đưa tên, email, JWT, mã tài khoản hoặc địa chỉ ví nhận vào QR.
   Token ID được giữ dưới dạng chuỗi để hỗ trợ đầy đủ uint256 và token `0`.
5. Người dùng có thể quét bằng camera điện thoại để mở URL, dùng **Quét QR bằng
   camera** trong trang tra cứu, hoặc **Tải ảnh QR**. Scanner ưu tiên camera sau,
   xử lý từ chối quyền và đóng stream khi dừng/rời trang. QR từ miền khác chỉ
   được trích định danh; ứng dụng không tự chuyển đến miền đó.
6. Trang **Tra cứu chứng nhận** tự xác minh URL QR. Cũng có thể nhập Chain ID,
   Contract Address và Token ID trực tiếp, hoặc dùng mã chứng nhận cũ.
7. Người quản lý sự kiện có thể chọn **Thu hồi on-chain**, xác nhận và ký qua
   MetaMask. Chỉ sau receipt và event đã được backend kiểm tra, trạng thái mới
   chuyển sang thu hồi và lịch sử mới ghi giao dịch thành công.

## PDF và quyền truy cập

PDF là A4 ngang, có logo tổ chức, tên người nhận, tên sự kiện, ngày tổ chức/ngày
cấp, Token ID, chain ID, QR, Contract Address và Transaction Hash. Font Noto Sans
được đóng gói cùng giấy phép OFL để hiển thị tiếng Việt độc lập máy chủ.
Ngày trên PDF dùng UTC+07:00, được ghi rõ ở cuối trang.

Dữ liệu được lấy từ bản ghi thật qua backend. Tên người nhận là snapshot được
lưu khi chuẩn bị cấp. Dữ liệu cá nhân/PDF/QR tải qua API cần JWT và quyền xem
chứng nhận; người khác không thể lấy bằng cách đoán ID. Backend xác minh lại
blockchain trước mỗi lần xuất PDF. Chứng nhận pending, INVALID hoặc REVOKED
không thể xuất PDF mới. QR vẫn dùng được sau thu hồi để người nhận kiểm tra.

## Kết quả xác minh

API `/api/v1/verify/blockchain` không cần đăng nhập. Chỉ chấp nhận chain/contract
đã cấu hình cho đơn vị phát hành, để không gán tính tin cậy của hệ thống cho
một contract tùy ý. RPC phải thực sự phục vụ đúng chain.

Backend đọc bytecode, `ownerOf`, `locked`, `getCertificate`, `tokenURI`; kiểm
tra người nhận, thời gian cấp, issuer, metadata URI, receipt thành công,
destination, canonical block, confirmations và `CertificateIssued`.
Nếu đã thu hồi, backend kiểm tra `CertificateRevoked`, người thực hiện và thời gian.

| Kết quả | Ý nghĩa |
| --- | --- |
| VALID | Các bằng chứng blockchain hợp lệ và chứng nhận chưa bị thu hồi |
| REVOKED | Đã xác minh chứng nhận nhưng có thu hồi trên blockchain hoặc tại hệ thống |
| INVALID | Sai chain/contract hoặc dữ liệu/quyền sở hữu/khóa/metadata/receipt không khớp |
| NOT FOUND | Token không tồn tại hoặc contract chưa được triển khai |

RPC không phản hồi hoặc chưa đủ confirmations được trả về như lỗi có thể thử
lại; không kết luận token là INVALID vì lỗi mạng. Các phản hồi cũ bị bỏ khi đổi
đầu vào; request cũ được hủy để tránh xác minh QR lặp khi tải lại phiên đăng nhập.

Token tồn tại trên blockchain nhưng chưa có trong SQLite vẫn có thể được xác
minh. Backend tìm block từ timestamp đã đọc trong contract bằng tìm kiếm nhị
phân, rồi kiểm tra event và receipt tại block đó. Không phụ thuộc một bản ghi
SQLite để chứng minh token tồn tại. Với token chưa đăng ký, tên sự kiện hiển thị
theo event ID on-chain và không tự tạo bản ghi cấp phát trong hệ thống.

## Lịch sử

Lịch sử có hành động, nguồn, thời gian giao dịch, người thực hiện và hash.
Với giao dịch blockchain, địa chỉ thực hiện lấy từ event đã xác minh; tên tài
khoản liên kết chỉ là thông tin hồ sơ bổ sung. Chế độ công khai chỉ trả địa chỉ
on-chain; API lịch sử riêng được phân quyền như chứng nhận.

- Cấp và thu hồi được ghi trong cùng transaction SQLite với cập nhật trạng thái.
- Sự kiện được chống ghi trùng theo chứng nhận, hành động, nguồn và hash.
- Thu hồi ngoài ứng dụng được nhập lại khi xác minh/đồng bộ lịch sử.
- Hash thu hồi đã gửi được worker xử lý tiếp khi trình duyệt đóng.
- Giao dịch thu hồi thất bại được ghi riêng và giữ trạng thái chứng nhận đã cấp.
- API thu hồi registry cũ vẫn hoạt động. Mục này ghi nguồn **Hệ thống**, không
  tự tạo hash hoặc giả vờ đã thu hồi trên blockchain.
- Hash trên Sepolia có link `https://sepolia.etherscan.io/tx/...`.

## Cấu hình và API

Sau khi cập nhật dependencies, chạy từ `backend`:

```powershell
.venv\Scripts\python.exe -m pip install -r requirements-dev.txt
.venv\Scripts\python.exe -m alembic upgrade head
```

Từ `frontend`, chạy `npm.cmd ci`. Cấu hình trong `backend/.env`:

```dotenv
PUBLIC_FRONTEND_URL=https://your-frontend.example
CHAIN_ID=11155111
SBT_CONTRACT_ADDRESS=0x...
WEB3_PROVIDER_URL=https://...
MIN_CONFIRMATIONS=2
```

Giữ cấu hình chain/contract frontend tương ứng. `PUBLIC_FRONTEND_URL` phải là
origin frontend người quét thực sự truy cập được. Camera trình duyệt cần HTTPS
hoặc localhost; localhost của máy tính không dùng được như địa chỉ từ điện
thoại. Khởi động lại backend sau khi đổi cấu hình.

| API | Quyền |
| --- | --- |
| `GET /verify/blockchain?chain_id=...&contract_address=...&token_id=...` | Công khai, chỉ dữ liệu blockchain/đơn vị phát hành |
| `GET /certificates/{id}/document` | Người nhận hoặc người quản lý sự kiện |
| `GET /certificates/{id}/qr.png` | Như trên |
| `GET /certificates/{id}/pdf` | Như trên; chỉ chứng nhận đang VALID |
| `GET /certificates/{id}/history` | Như trên; có phân trang |
| `PATCH /certificates/{id}/revocation-transaction` | Người quản lý sự kiện; chỉ nhận hash, không nhận private key |
| `PUT /organizations/{id}/logo` | Người quản lý tổ chức; multipart field `file` |

API xác minh cũ được giữ để tương thích. Giao diện tra cứu và PDF mới dùng API
xác minh đầy đủ. Hướng dẫn chạy dự án: [INTEGRATION.md](INTEGRATION.md).

## Kiểm tra đã thực hiện

| Kiểm tra | Kết quả cuối |
| --- | --- |
| Backend `python -m pytest -q` | **106 passed** |
| Smart contract `npm.cmd test` | **102 passing** |
| Trình duyệt `npm.cmd run test:e2e` | **29 passed** |
| Ruff, ESLint, Solhint | Qua |
| Frontend production build | Qua |
| Blockchain/backend JSON-RPC integration | Qua |
| Migration hiện tại và round-trip/backfill | Qua |
| Kiểm tra trực quan PDF đã render | Qua |

Đã kiểm tra quyền PDF/QR/lịch sử, font tiếng Việt, trang A4 ngang, logo thực,
snapshot người nhận, link trong PDF, các trạng thái VALID/REVOKED/INVALID/NOT
FOUND, dữ liệu sai owner/lock/URI, thu hồi registry/on-chain, failed revocation,
chống trùng lịch sử, migration/backfill và confirmations pending.

Kiểm thử trình duyệt dùng EVM thật cục bộ để mint, tải QR/PDF, quét PNG, tự mở
định danh QR, thu hồi và xác minh lại. Luồng camera được kiểm tra bằng
`getUserMedia` thật của trình duyệt với video QR giả lập; cũng kiểm tra từ chối
quyền và QR không liên quan. Có token mint trực tiếp ngoài SQLite để kiểm tra
API vẫn xác minh được. PDF đã được render và kiểm tra trực quan.

Chưa ký giao dịch Sepolia công khai bằng ví người dùng hoặc thử trên phần cứng
điện thoại thật; các bước đó cần cấu hình triển khai thực tế và ví người dùng.

Tham khảo thư viện: [ZXing Browser](https://github.com/zxing-js/browser),
[node-qrcode](https://github.com/soldair/node-qrcode),
[ReportLab](https://docs.reportlab.com/reportlab/userguide/ch2_graphics/).
