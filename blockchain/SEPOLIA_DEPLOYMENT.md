# Deploy SoulboundCertificate lên Ethereum Sepolia

Chain đích duy nhất cho các lệnh dưới đây: **Ethereum Sepolia, chainId 11155111**. Đây là chain ID được công bố trong [tài liệu Sepolia của Ethereum clients](https://github.com/eth-clients/sepolia/blob/main/README.md).

## Cấu hình cần có

Mở `blockchain/.env` và **tự điền trên máy của bạn**:

- `SEPOLIA_RPC_URL`: URL RPC Ethereum Sepolia đang hoạt động.
- `DEPLOYER_PRIVATE_KEY`: khóa của **ví test riêng** được bạn cho phép sử dụng cho tác vụ này, dạng 0x và 64 ký tự hex.
- Ví trên phải có **Sepolia ETH test** đủ trả gas. Không dùng tiền thật hoặc yêu cầu mua ETH Mainnet.
- `ETHERSCAN_API_KEY`: chỉ cần khi xác minh source trên Etherscan.

Không gửi private key trong chat. Không copy ví Hardhat mẫu vào .env để dùng trên mạng công khai. Không dùng ví chứa tài sản thật. Script không tạo ví hoặc sinh private key.

.env đã được gitignore. Không dùng Get-Content/cat để đưa nội dung .env vào log. Các lệnh kiểm tra chỉ xuất trạng thái cấu hình, địa chỉ công khai và số dư; raw RPC errors được chặn khỏi log để tránh lộ credential.

Các tùy chọn:

| Biến | Mặc định / ý nghĩa |
| --- | --- |
| INITIAL_ADMIN_ADDRESS | Ví deployer; có thể chỉ định Admin khác |
| INITIAL_ORGANIZER_ADDRESS | Trống; nếu đặt sẽ cấp Organizer sau deploy. Deployer phải là initial Admin |
| MAX_TRANSACTION_COST_ETH | 0.02 Sepolia ETH, giới hạn gas tối đa cho từng giao dịch; không phải số ETH bắt buộc cần nạp |
| SEPOLIA_CONFIRMATIONS | 2 |
| SMOKE_RECIPIENT_ADDRESS | Ví deployer |
| SMOKE_METADATA_URI | Metadata JSON thật dạng data URI, không cần IPFS cho test |

Để tự kiểm tra cấp quyền và mint bằng một key, dùng deployer làm Admin (để INITIAL_ADMIN_ADDRESS trống). Smoke test cấp ORGANIZER_ROLE cho deployer nếu chưa có, rồi mint một token test vào ví được cấu hình. Metadata ghi rõ đây là kiểm tra triển khai, không phải xác nhận tham gia một hoạt động thật. Token test vẫn là SBT locked vĩnh viễn.

Vai trò Admin dùng AccessControl DEFAULT_ADMIN_ROLE; contract không có owner() kiểu Ownable. ownerOf(tokenId) là chủ sở hữu từng token.

## Trình tự chạy

Trong PowerShell:

```powershell
cd D:\Blockchain-NTH\BoLocChan\blockchain
npm.cmd run compile
npm.cmd test
npm.cmd run preflight:sepolia
```

Preflight **chỉ đọc**, không ký/gửi giao dịch. Nó yêu cầu RPC và key được cấu hình, truy vấn chain thực từ RPC, kiểm tra số dư, estimate gas với buffer 20%, lấy EIP-1559 fee và so sánh số dư với chi phí tối đa. Nếu thiếu thông tin, RPC không thuộc Sepolia, phí vượt giới hạn hoặc số dư không đủ, lệnh dừng trước broadcast.

Khi preflight trả `status=ready`:

```powershell
npm.cmd run deploy:sepolia
npm.cmd run check:sepolia
npm.cmd run smoke:sepolia
```

Deploy kiểm tra lại chain và số dư ngay trước gửi. Giao dịch được ký với chainId 11155111. Không có đường deploy Mainnet trong script.

Smoke test kiểm tra quyền Organizer, thực hiện mint test nếu chưa có chứng nhận test tương ứng, chờ xác nhận rồi đọc ownerOf/tokenURI/locked/verifyCertificate/isRevoked/getCertificate. Chạy lại với cùng contract/người nhận không mint thêm token trùng.

Mỗi giao dịch cấp role và mint cũng được kiểm tra số dư/gas trước khi gửi. Nếu deploy thành công nhưng thiếu ETH cho thao tác tiếp theo, record deploy được giữ lại và báo lỗi ở bước tương ứng.

## Kết quả được lưu sau giao dịch thật

`blockchain/deployments/sepolia.json` chỉ được tạo **sau khi có transaction hash broadcast thật**. Record có trạng thái submitted/confirmed, contract address, chainId, deployer, Admin, constructor args, tx hash, nonce, block, thời gian, compiler/settings, gas và explorer links.

Script lưu hash trước khi chờ xác nhận; cập nhật confirmed sau khi receipt thành công. Nếu chạy lại, script tái sử dụng deployment đã xác nhận hoặc khôi phục trạng thái từ receipt thật, không tự deploy contract thứ hai.

Các ABI được cập nhật với địa chỉ và chainId Sepolia sau khi deployment được xác nhận và read checks đạt:

- `frontend/src/utils/SoulboundCertificate.abi.json`
- `backend/app/core/SoulboundCertificate.abi.json`

check:sepolia đối chiếu runtime bytecode với artifact compile, kiểm tra Admin role, ERC721/ERC5192, name, symbol, totalSupply và token 0 nếu đã có token. Lệnh chỉ đọc RPC; không cần private key.

Smoke test lưu thêm Organizer grant transaction, mint transaction, token ID và kết quả đọc vào deployment record. Lệnh không tự revoke token test.

Nếu record còn submitted, kiểm tra transaction URL trong record. Khi giao dịch đã thành công và đủ confirmations, chạy lại deploy:sepolia để khôi phục. Nếu reverted, replaced hoặc cancelled, cần xác minh trên explorer trước khi lưu trữ record cũ và deploy mới. Không xóa record pending rồi chạy lại ngay.

Frontend dùng VITE_SBT_CONTRACT_ADDRESS và VITE_CHAIN_ID=11155111; backend dùng SBT_CONTRACT_ADDRESS, CHAIN_ID=11155111 và WEB3_PROVIDER_URL trỏ Sepolia. Các giá trị lấy từ deployment đã xác nhận. Không điền địa chỉ từ mạng khác.

## Verify source trên Etherscan

Điền ETHERSCAN_API_KEY cục bộ rồi chạy:

```powershell
npm.cmd run verify:sepolia
```

Script lấy địa chỉ và constructor arguments từ deployment record, đối chiếu code trên Sepolia rồi gọi verify plugin. Chỉ ghi etherscanVerified=true khi API xác nhận thành công hoặc báo source đã verified.

Hardhat-verify 2.1.4 đang dùng trong repo nhận API key dạng một chuỗi để chọn Etherscan API v2; cấu hình đã chuyển sang dạng này. [Hướng dẫn Hardhat 2 chính thức](https://v2.hardhat.org/hardhat-runner/plugins/nomicfoundation-hardhat-verify) mô tả API key và constructor arguments.

Có thể chạy thủ công:

```powershell
npm.cmd run verify -- <contractAddress> <initialAdminAddress>
```

Dùng đúng compiler 0.8.28, optimizer 200 runs, EVM Cancun và constructor Admin đã lưu. Nếu Etherscan chưa lập chỉ mục deployment, đợi rồi thử lại; không deploy lại chỉ vì verify source thất bại.

Sau khi verified, mở explorerUrl + #code và dùng Read Contract để kiểm tra DEFAULT_ADMIN_ROLE/ORGANIZER_ROLE, hasRole, name, symbol, totalSupply, ownerOf và locked cho token ID thật đã mint.

## Trạng thái khi chuẩn bị bàn giao

Lần kiểm tra hiện tại: .env đã tạo với các ô trống, RPC/key chưa có, chưa xác định được ví hoặc số dư, chưa gửi giao dịch Sepolia và chưa có deployment record Sepolia.

Các unit test dùng EVM cục bộ và mock cho logic kiểm tra an toàn; chúng không được trình bày như kết quả deploy Sepolia. Cần cấu hình thực và đủ Sepolia ETH để hoàn tất các bước trên.
