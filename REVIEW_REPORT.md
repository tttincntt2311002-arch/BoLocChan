# Báo cáo rà soát và sửa lỗi

Ngày: 13/11/2026.

Đã rà soát React, FastAPI, SQLite, luồng MetaMask/ethers, đồng bộ giao dịch,
smart contract và các lệnh kiểm tra của dự án. Các thay đổi tích hợp trước đó
được giữ lại. Lượt sửa này giữ nguyên Solidity production, ABI và schema SQLite.

## Các lỗi đã sửa

| Lỗi | Cách sửa | File chính |
| --- | --- | --- |
| Thử mint lại có thể gắn hash thất bại từ localStorage vào lần cấp mới | Xóa hash của lần đã được backend xác nhận thất bại trước khi retry | `frontend/src/utils/issuance.js` |
| localStorage chứa `null`, mảng hoặc giá trị sai làm lỗi luồng mint | Kiểm tra cấu trúc outbox và định dạng hash trước khi sử dụng | `frontend/src/utils/issuance.js` |
| Đổi ví/mạng sau khi lấy khóa nhưng trước broadcast khiến khóa bị giữ không cần thiết | Giải phóng khóa khi chưa yêu cầu gửi giao dịch; tiếp tục giữ pending khi kết quả broadcast chưa rõ | `frontend/src/utils/issuance.js` |
| Phản hồi logout, cập nhật hồ sơ hoặc ví cũ có thể ghi đè tài khoản vừa đăng nhập | Đối chiếu thế hệ phiên và JWT trước khi cập nhật state | `frontend/src/hooks/useAuthStore.js` |
| Phản hồi RPC chậm có thể kết nối lại ví vừa ngắt hoặc ghi đè ví mới | Loại bỏ phản hồi cũ và cập nhật ngay theo sự kiện ví | `frontend/src/hooks/useWalletStore.js` |
| Lỗi MetaMask lồng trong `UNKNOWN_ERROR` có thể không được nhận diện là từ chối | Kiểm tra các mã lỗi lồng nhau | `frontend/src/utils/errors.js` |
| BrowserProvider không được dọn khi kiểm tra signer/role/bytecode thất bại | Hủy provider trong nhánh lỗi chuẩn bị mint | `frontend/src/utils/web3.js` |
| Kết quả tra cứu cũ có thể xuất hiện sau khi nhập Token ID khác | Vô hiệu hóa yêu cầu cũ khi thay đổi đầu vào hoặc mã chứng nhận trên URL | `frontend/src/pages/VerifyPage.jsx` |
| Receipt thiếu `status` có thể bị hiểu thành giao dịch thất bại; dữ liệu RPC sai có thể gây lỗi 500 | Dùng chung bộ kiểm tra receipt, trạng thái, hash, block, confirmations và dữ liệu giao dịch; trả lỗi RPC và giữ pending khi bằng chứng không hợp lệ | `backend/app/services/blockchain.py`, `backend/app/services/certificates.py` |
| Quét log có thể không tiến lên khi phạm vi quét nhỏ hơn số confirmations | Tiến con trỏ đầy đủ ở vùng lịch sử; chỉ quét chồng gần đầu chuỗi | `backend/app/services/blockchain.py` |
| Log sai người nhận hoặc Token ID không hợp lệ có thể gây trạng thái sai/lỗi xử lý | Kiểm tra address, topics, recipient, event và định dạng uint256 | `backend/app/services/blockchain.py` |
| 20 bản ghi đầu lỗi liên tục có thể làm các bản ghi phía sau không bao giờ được đồng bộ | Duyệt theo ID với con trỏ từng batch, quay lại đầu sau khi hết danh sách | `backend/app/services/sync.py` |
| Lệnh lint Solidity không chạy do thiếu cấu hình | Thêm cấu hình Solhint; các ngoại lệ style chỉ áp dụng cho fixture kiểm thử | `blockchain/.solhint.json`, `blockchain/contracts/test/.solhint.json` |
| Kiểm thử trình duyệt phụ thuộc artifact đã được tạo thủ công | Biên dịch contract trước khi khởi tạo EVM kiểm thử; trả exit code lỗi khi khởi tạo thất bại | `frontend/tests/start_chain.cjs` |

## Kết quả kiểm tra

| Kiểm tra | Kết quả |
| --- | --- |
| Backend: `python -m pytest -q` | **91 passed** |
| Backend: `python -m ruff check app main.py tests` | Qua |
| Contract: `npm.cmd test` | **102 passing** |
| Contract: `npm.cmd run lint` | Qua |
| Blockchain/backend: `npm.cmd run test:integration` | Qua, receipt thật và kiểm tra thu hồi qua JSON-RPC cục bộ |
| Frontend: `npm.cmd run test:e2e` | **25 passed** |
| Frontend: `npm.cmd run lint` | Qua |
| Frontend: `npm.cmd run build` | Qua |
| `git diff --check` | Qua |
| API `/health` sau khi khởi động lại | `healthy` |
| Frontend `http://127.0.0.1:5173/` | HTTP 200 |

Đã bổ sung 14 trường hợp kiểm thử backend và 8 trường hợp trình duyệt so với
lượt tích hợp trước. Bộ kiểm thử cũ về JWT, phân quyền, hồ sơ, đăng ký/điểm danh,
migration, tính không chuyển nhượng, chống cấp trùng và thu hồi tiếp tục qua.

Pytest còn một cảnh báo deprecation từ Starlette/AnyIO; không có test thất bại.
Các bài kiểm thử dùng database tách biệt và không tạo dữ liệu demo vào database
đang sử dụng.

## Phạm vi xác minh blockchain

Kiểm thử đã mint, xác minh receipt và phục hồi từ `CertificateIssued` trên
Hardhat EVM cục bộ. Trình duyệt dùng adapter EIP-1193; backend đọc JSON-RPC thật.
Metadata trong kiểm thử trình duyệt dùng JSON cố định để không phụ thuộc IPFS.

Chưa thực hiện giao dịch Sepolia công khai hoặc ký bằng extension MetaMask thật.
Cấu hình hiện tại chưa có contract address/RPC backend Sepolia. Các bước cấu
hình và kiểm tra tiếp được mô tả trong [INTEGRATION.md](INTEGRATION.md).
