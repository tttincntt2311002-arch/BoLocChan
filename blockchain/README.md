# Soulbound Certificate

Contract chính: [contracts/SoulboundCertificate.sol](contracts/SoulboundCertificate.sol).

Solidity **0.8.28**, OpenZeppelin Contracts **5.6.1**, Hardhat **2.29.2**, ethers v6. Phiên bản compiler và dependency được khóa trong package-lock.json. Hardhat sử dụng solc-js đã cài trong dự án, không tải compiler trong lúc compile.

## Cài đặt và kiểm thử

Node.js 22+; đã chạy bằng Node.js 24.14.0 trên Windows.

```powershell
cd D:\Blockchain-NTH\BoLocChan\blockchain
npm.cmd ci
npm.cmd run compile
npm.cmd test
npm.cmd run test:coverage
npm.cmd run test:integration
```

Trên Linux/macOS dùng `npm` thay `npm.cmd`.

- Unit test: **91 passing** trên EVM Hardhat, deploy bytecode và thực thi giao dịch thật.
- Coverage cho SoulboundCertificate: **100% statements, branches, functions, lines**. Test harness không tính vào coverage.
- Integration: tự mở Hardhat JSON-RPC node tạm tại port trống, deploy, cấp Organizer, mint, đọc receipt bằng backend Python, revoke và xác minh lại trạng thái. Không dùng database hay server đang chạy của bạn.
- Integration cần dependency Python của backend, mặc định dùng `backend/.venv`. Có thể chọn executable bằng biến môi trường `PYTHON`.
- `contracts/test/CertificateReceiver.sol` chỉ chứa receiver/harness phục vụ kiểm thử; script deploy chỉ triển khai SoulboundCertificate.

## Phân quyền

`DEFAULT_ADMIN_ROLE` là Admin; `ORGANIZER_ROLE = keccak256("ORGANIZER_ROLE")`.

| Thao tác | Admin | Organizer hiện đang có quyền | Participant / Verifier |
| --- | --- | --- | --- |
| Cấp/thu hồi quyền Organizer | Có | Không | Không |
| Mint chứng nhận | Cần được cấp thêm ORGANIZER_ROLE | Có | Không |
| Thu hồi chứng nhận của chính mình đã cấp | Có | Có | Không |
| Thu hồi chứng nhận do Organizer khác cấp | Có | Không | Không |
| Đọc/verify dữ liệu | Có | Có | Có |

Constructor nhận một địa chỉ Admin khác zero. Admin ban đầu **không tự động có quyền mint**. Cấp hoặc thu hồi Organizer bằng AccessControl `grantRole` / `revokeRole`. Khi bị gỡ quyền, Organizer không thể mint hoặc revoke tiếp; chứng nhận đã phát hành vẫn giữ nguyên trạng thái.

Vai trò JWT trong backend và role trên smart contract được quản lý riêng. Admin của contract phải cấp quyền on-chain cho ví ký giao dịch.

## API contract

```solidity
constructor(address initialAdmin);

mintCertificate(
    address recipient,
    string eventId,
    string metadataURI,
    bytes32 certificateHash
) returns (uint256 tokenId);

revokeCertificate(uint256 tokenId);
verifyCertificate(uint256 tokenId) returns (bool);
isRevoked(uint256 tokenId) returns (bool);
ownerOf(uint256 tokenId) returns (address);
tokenURI(uint256 tokenId) returns (string);
locked(uint256 tokenId) returns (bool);
getCertificate(uint256 tokenId) returns (CertificateData);
hasCertificate(address recipient, string eventId) returns (bool);
certificateTokenId(address recipient, string eventId) returns (uint256);
totalSupply() returns (uint256);
```

Hàm đọc là view; mint/revoke cần giao dịch từ ví có quyền.

`CertificateData` gồm: eventId, recipient, issuer, certificateHash, issuedAt, revoked, revokedAt, revokedBy. Không có hàm sửa metadata, sửa issuer, mở khóa hoặc burn.

- Token ID bắt đầu từ **0** và tăng tuần tự. `totalSupply` bao gồm cả chứng nhận đã revoke.
- Một cặp `(recipient, keccak256(bytes(eventId)))` chỉ được cấp một lần, kể cả sau khi revoke và kể cả khi đổi Organizer.
- `eventId` so sánh đúng byte, phân biệt hoa/thường; dài 1–128 byte UTF-8 và không có ký tự ASCII whitespace ở đầu/cuối. Hệ thống nên dùng UUID sự kiện cố định.
- URI dài 1–2.048 byte UTF-8, không rỗng và không có ASCII whitespace ở đầu/cuối.
- Recipient khác địa chỉ zero; certificateHash khác bytes32(0).
- certificateHash là digest 32 byte của dữ liệu chứng nhận được chuẩn hóa theo quy ước ngoài chain. Contract lưu digest; bên xác minh tự băm lại cùng dữ liệu để đối chiếu.
- `verifyCertificate` trả false cho token không tồn tại hoặc đã revoke. Các hàm đọc token khác ném `ERC721NonexistentToken` nếu token không tồn tại.
- `certificateTokenId` phân biệt được token 0 với không có chứng nhận; trường hợp không có ném `CertificateNotFound`.

## Soulbound và ERC-5192

Contract kế thừa trực tiếp IERC5192 và công bố interface ID qua `type(IERC5192).interfaceId` (`0xb45a3c0e`). Token tồn tại luôn trả `locked(tokenId) == true`; không có cơ chế unlock.

Với OpenZeppelin v5, mọi thay đổi chủ sở hữu đi qua `_update`. Override này chỉ cho phép tạo token chưa tồn tại; chặn transfer giữa hai ví, self-transfer và cả internal burn. `transferFrom` cùng hai overload `safeTransferFrom` đều bị chặn ở cùng lớp xử lý. Cả `approve` và `setApprovalForAll` đều revert, bao gồm yêu cầu xóa approval.

Mint thực hiện kiểm tra, ghi trạng thái và duplicate guard, tạo token, ghi URI, phát event rồi gọi `ERC721Utils.checkOnERC721Received` của OpenZeppelin. Receiver nhìn thấy dữ liệu đã hoàn chỉnh. Receiver từ chối thì toàn bộ giao dịch rollback. ReentrancyGuard chặn nested mint và gọi chéo revoke trong callback.

Revoke chỉ đánh dấu revoked và lưu thời điểm/người thu hồi; owner, URI, hash, lịch sử event và trạng thái locked được giữ nguyên. Không thể mint lại cùng ví/event sau khi revoke.

Tham chiếu chính thức: [ERC-5192](https://eips.ethereum.org/EIPS/eip-5192), [OpenZeppelin v5 ERC721 và _update](https://docs.openzeppelin.com/contracts/5.x/api/token/erc721).

## Events

- `Transfer(address(0), recipient, tokenId)`: sự kiện ERC-721 khi mint.
- `Locked(tokenId)`: sự kiện ERC-5192, phát khi mint.
- `CertificateIssued(tokenId, recipient, eventId, metadataURI, certificateHash, issuer, issuedAt)`: tokenId, recipient và eventId được indexed. Chuỗi eventId trong topics là keccak256 của bytes; lấy chuỗi gốc bằng getCertificate.
- `CertificateRevoked(tokenId, revokedBy)`: không phát Transfer hoặc Unlocked khi revoke.
- RoleGranted / RoleRevoked do AccessControl cung cấp.

## Deploy trên localhost

Terminal 1:

```powershell
npm.cmd run node
```

Terminal 2 trong cùng thư mục blockchain:

```powershell
npm.cmd run deploy:local
npx.cmd hardhat console --network localhost
```

Trong Hardhat console:

```javascript
const [admin, organizer, participant] = await ethers.getSigners();
const deployment = require("./deployments/localhost.json");
const certificate = await ethers.getContractAt("SoulboundCertificate", deployment.contractAddress);
await (await certificate.grantRole(await certificate.ORGANIZER_ROLE(), organizer.address)).wait();

const eventId = "event-001";
const metadataURI = "ipfs://yourCID/metadata.json";
const certificateHash = ethers.keccak256(ethers.toUtf8Bytes("canonical certificate bytes"));
await (await certificate.connect(organizer).mintCertificate(
  participant.address, eventId, metadataURI, certificateHash
)).wait();

await certificate.ownerOf(0);
await certificate.locked(0);             // true
await certificate.verifyCertificate(0);  // true
await (await certificate.connect(organizer).revokeCertificate(0)).wait();
await certificate.verifyCertificate(0);  // false
await certificate.locked(0);             // vẫn true
```

`deploy:local` lưu deployment và xuất ABI. Địa chỉ trong `deployments/localhost.json` chỉ có ý nghĩa với node đã deploy. Khi khởi động node mới, cần deploy lại.

`npm.cmd run deploy:ephemeral` dùng EVM trong tiến trình để kiểm tra script deploy; mạng biến mất khi lệnh kết thúc, nên ABI xuất ra để trống địa chỉ thay vì công bố một địa chỉ không còn hoạt động.

## Sepolia và ABI

Hướng dẫn deploy Sepolia, preflight số dư/gas, kiểm tra contract và mint test: [SEPOLIA_DEPLOYMENT.md](SEPOLIA_DEPLOYMENT.md). Cần tự cấu hình RPC và private key của ví test trong .env trước khi chạy; script không tạo khóa hoặc dùng ví mặc định trên mạng công khai.

Sao chép .env.example thành .env, cấu hình DEPLOYER_PRIVATE_KEY ngoài source code và SEPOLIA_RPC_URL. INITIAL_ADMIN_ADDRESS mặc định là deployer. INITIAL_ORGANIZER_ADDRESS là tùy chọn cấp Organizer lúc deploy, chỉ dùng khi deployer cũng là initial Admin. Nếu Admin là ví khác, ví Admin cấp Organizer sau deploy.

```powershell
npm.cmd run deploy:sepolia
npm.cmd run check:sepolia
npm.cmd run smoke:sepolia
npm.cmd run verify:sepolia
```

Không có private key mặc định trong config. Không tự gửi giao dịch lên mạng công khai khi compile/test. .env được gitignore.

`npm.cmd run export-abi` xuất ABI mới sang:

- `frontend/src/utils/SoulboundCertificate.abi.json`
- `backend/app/core/SoulboundCertificate.abi.json`

Backend verifier hỗ trợ CertificateIssued và tuple mới; đồng thời giữ đọc lịch sử CertificateMinted/tuple của các SBTCertificate đã triển khai trước đây. Contract cũ không phải target compile/deploy mới.

Để backend xác nhận giao dịch local, đặt WEB3_PROVIDER_URL=http://127.0.0.1:8545, CHAIN_ID=31337 và SBT_CONTRACT_ADDRESS bằng địa chỉ đã deploy. MIN_CONFIRMATIONS mặc định là 2; với Hardhat automine cần thêm block, hoặc đặt 1 khi phát triển.

API /revoke của backend thu hồi tại registry. Để ghi trạng thái thu hồi on-chain, ví issuer Organizer hoặc Admin gửi giao dịch revokeCertificate theo quy tắc của contract.

## Dependency và kết quả kiểm tra

Toolchain chỉ nạp các plugin ethers/chai/verify/coverage được sử dụng. Hardhat đã được cập nhật bản vá; solc vẫn cố định 0.8.28. Overrides khóa tmp 0.2.7 và serialize-javascript 7.1.3 để xử lý advisory của dependency công cụ phát triển.

Lần kiểm tra npm audit hiện tại còn **18 low / 8 moderate / 0 high / 0 critical**, thuộc dependency phát triển của hệ Hardhat 2/coverage; OpenZeppelin không nằm trong báo cáo. Một số bản sửa do npm đề xuất yêu cầu đổi major của toolchain, nên không áp dụng npm audit fix --force.

Compile, unit test, coverage, deploy trên mạng tạm và kiểm tra JSON-RPC với backend đều đã chạy. Không triển khai Sepolia trong lần thực hiện này.
