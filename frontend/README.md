# SoulPass frontend

## Chạy web

Cần backend đang chạy trên cổng 8000. Trong PowerShell:

```powershell
cd frontend
npm.cmd ci
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

Mã tài khoản (UUID) nằm dưới tên và vai trò ở cuối thanh bên. Bấm biểu tượng sao chép cạnh ID để lấy mã đầy đủ, gửi cho Organizer điền vào ô **Mã tài khoản người tham gia**. Đây là ID của tài khoản đang đăng nhập, không phải mã mời hoặc địa chỉ ví. Có thể chọn trực tiếp nội dung ô ID và nhấn Ctrl+C nếu trình duyệt không cho phép sao chép tự động.

Các trang số liệu, sự kiện, người tham gia và chứng nhận dùng API thật. Organizer thêm người tham gia bằng UUID hoặc CSV, điểm danh rồi cấp chứng nhận qua ví. Chức năng quên mật khẩu hướng dẫn liên hệ quản trị viên; không giả lập gửi email.

API mặc định: `http://localhost:8000/api/v1`. Có thể cấu hình `VITE_API_BASE_URL` trong `.env`. Backend phải cho phép đúng origin frontend trong `CORS_ORIGINS`, ví dụ `http://localhost:5173`.

## Kết nối MetaMask và cấp SBT thật trên Hardhat local

Các bước dưới đây dùng blockchain local, không tốn ETH thật. MetaMask ký giao dịch; backend kiểm chứng receipt qua RPC trước khi chuyển chứng nhận sang `issued`.

1. Từ thư mục gốc, mở terminal riêng và giữ node chạy:

   ```powershell
   cd blockchain
   npm.cmd run node
   ```

2. Trong terminal khác, cũng bắt đầu từ thư mục gốc:

   ```powershell
   cd blockchain
   npm.cmd run deploy:local
   npx.cmd hardhat console --network localhost
   ```

   Trong console, thay chuỗi `0x...` bằng địa chỉ ví **Organizer trong MetaMask**. Ví này khác ví Participant nhận chứng nhận:

   ```javascript
   const [admin] = await ethers.getSigners();
   const deployment = require('./deployments/localhost.json');
   const certificate = await ethers.getContractAt('SoulboundCertificate', deployment.contractAddress);
   const organizerAddress = '0x2eB91301804B078783E5795Cdde5eD915ae45307'; // thay bằng địa chỉ ví của bạn
   await (await certificate.grantRole(await certificate.ORGANIZER_ROLE(), organizerAddress)).wait();
   await (await admin.sendTransaction({to: organizerAddress, value: ethers.parseEther('10')})).wait();
   deployment.contractAddress; // sao chép địa chỉ contract thực tế vào cả hai cấu hình
   ```

   Quyền Organizer của tài khoản đăng nhập và `ORGANIZER_ROLE` trên contract là hai quyền riêng. ETH ở bước này chỉ có giá trị trên node local.

3. Sửa các biến tương ứng trong [backend/.env](../backend/.env), giữ nguyên các biến khác:

   ```dotenv
   WEB3_PROVIDER_URL=http://127.0.0.1:8545
   CHAIN_ID=31337
   SBT_CONTRACT_ADDRESS=<địa chỉ deployment.contractAddress vừa deploy>
   MIN_CONFIRMATIONS=1
   ```

   Sửa [frontend/.env](./.env):

   ```dotenv
   VITE_CHAIN_ID=31337
   VITE_CHAIN_NAME=Hardhat Local
   VITE_RPC_URL=http://127.0.0.1:8545
   VITE_SBT_CONTRACT_ADDRESS=

   VITE_BLOCK_EXPLORER_URL=
   ```

   Khởi động lại backend và Vite. Không dùng địa chỉ contract toàn số 0 hoặc địa chỉ lấy từ lần chạy node cũ. Khi node local bị reset, cần deploy lại và cập nhật cấu hình.

4. Đăng nhập Participant → **Hồ sơ** → **Kết nối MetaMask** → **Liên kết ví MetaMask hiện tại**. Chỉ nhập địa chỉ ví bằng tay cũng lưu được, nhưng không chứng minh quyền sở hữu ví. Ví đã liên kết trong tài khoản và ví đang kết nối là hai trạng thái khác nhau.
5. Đăng nhập Organizer → kết nối đúng ví đã được cấp role → tạo sự kiện, thêm Participant và điểm danh `attended` → **Cấp chứng nhận SBT**. Dùng URI metadata IPFS truy cập được, hoặc chọn tạo metadata và cấu hình `PINATA_JWT` ở backend. CID mẫu trong tài liệu/test không phải dữ liệu IPFS thật.
6. Xác nhận giao dịch trong MetaMask. Chỉ khi backend xác minh receipt thành công thì bản ghi mới là `issued`. Participant có thể mở **Bộ sưu tập** với ví nhận, và bất kỳ ai cũng có thể tra cứu token công khai.

Muốn chạy không có dữ liệu demo: bỏ bước seed, dùng CLI `create-admin` trong [hướng dẫn backend](../backend/README.md), đăng ký tài khoản trên web rồi dùng API Admin cấp Organizer. Tổ chức, sự kiện và chứng nhận sau đó đều do người dùng tạo qua API.

Để dùng Sepolia, xem [hướng dẫn deploy Sepolia](../blockchain/SEPOLIA_DEPLOYMENT.md); đặt chain ID `11155111`, RPC Sepolia và cùng địa chỉ contract Sepolia ở hai phía. Ví ký cần Sepolia ETH để trả gas.

## Demo khi chưa có metadata hoặc Pinata JWT

Có thể upload metadata bằng trang Pinata rồi dùng URI đã có trên web. Cách này không cần `PINATA_JWT` trong backend.

1. Dùng tệp JSON đã chuẩn bị: [prom-metadata.json](../backend/examples/prom-metadata.json). Tệp có tên, mô tả và thuộc tính chứng nhận Prom, không chứa thông tin cá nhân hoặc CID mẫu. Luồng dùng metadata đã có chấp nhận JSON không có ảnh; mẫu này phù hợp để demo mint, xác minh, QR/PDF và thu hồi. Chế độ web tự tạo/upload metadata vẫn yêu cầu ảnh IPFS.
2. Đăng nhập [Pinata](https://app.pinata.cloud), mở Files và upload **một tệp** JSON này lên **Public IPFS**. Hướng dẫn upload trên web: [Pinata](https://pinata.cloud/blog/how-to-use-pinata-a-step-by-step-guide-for-beginners/).
3. Copy CID của tệp sau khi upload thành công. Mở tệp trong Pinata để kiểm tra tên và mô tả đã đọc được.
4. Trong trang cấp chứng nhận, chọn **Dùng metadata đã có trên IPFS**, nhập `ipfs://` nối với CID thật vừa copy. Vì upload trực tiếp một tệp, không tự nối thêm `/metadata.json` vào CID của tệp.
5. Chọn sự kiện và người đã tham dự, kết nối ví Organizer có quyền, bấm cấp và xác nhận giao dịch trong MetaMask. Chờ trạng thái `issued` rồi demo tra cứu, QR/PDF và thu hồi.

Nếu sau này muốn chọn **Tạo metadata và tải lên IPFS** ngay trong web, tạo API key trong Pinata, lưu JWT riêng vào `PINATA_JWT` ở backend và khởi động lại backend. Không đặt JWT trong biến `VITE_*`. Upload thủ công ở trên không yêu cầu cấu hình key này.

Nếu báo không tải được metadata, kiểm tra tệp JSON đã ở Public IPFS và CID được copy nguyên vẹn. Gateway đọc được cấu hình bằng `VITE_IPFS_GATEWAY` trong frontend. Với tệp pin trên Pinata có thể dùng `https://gateway.pinata.cloud/ipfs/`, hoặc gateway riêng của tài khoản Pinata có hậu tố `/ipfs/`. Khởi động lại Vite sau khi thay đổi cấu hình gateway; giữ nguyên URI `ipfs://...` của chứng nhận.

## Kiểm tra

```powershell
npm.cmd run build
npm.cmd run test:e2e
```

Test E2E khởi động backend với SQLite tạm tại cổng 8011, Vite tại cổng 5178 và EVM tạm tại 18545/18546; không dùng database hoặc token đang sử dụng của bạn. Cần cài dependencies của cả backend và blockchain. Runner chọn biến `PYTHON`, rồi `backend/.venv`, rồi `.venv` tại gốc dự án.

Trên Windows, test dùng Microsoft Edge đã cài sẵn ở chế độ headless. Có thể đổi bằng `PLAYWRIGHT_CHANNEL=chrome`. Trên Linux/macOS, chạy `npx playwright install chromium` trước khi test.

Test kiểm tra đăng nhập thật, sai mật khẩu, khôi phục phiên, thu hồi token, truy cập theo vai trò, đăng ký, sửa hồ sơ, lỗi kết nối, đồng bộ đăng xuất, responsive, mint/revoke EVM, QR/PDF và phục hồi giao dịch. Provider ví được điều khiển tự động; chưa kiểm chứng extension MetaMask thật. Xem thêm [backend](../backend/README.md) và [smart contract](../blockchain/README.md).
