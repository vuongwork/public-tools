# Public Tools

Bộ công cụ chạy trên trình duyệt, dùng HTML, CSS và JavaScript thuần (không build, không thư viện).

## Chia Tiền Nhóm

Một bảng duy nhất: mỗi hàng là một người, mỗi cột là một khoản chi. Nhập thẳng trên bảng.

- **Tick** ô = người đó tham gia khoản đó (được chia đều). Nút **Tick hết / Bỏ hết** dưới tên khoản (hoặc phím `A` khi đứng ở một ô) tick/bỏ tick cả cột.
- **Bấm vào ô** để nhập:
  - **Đã trả** — nhiều người có thể cùng trả một khoản; tổng khoản = tổng tiền đã trả.
  - **Phần riêng** — tiền chỉ người này chịu, trừ ra trước rồi mới chia đều: món của riêng mình (mỗi người một ly nước giá khác nhau), gọi thêm món, hoặc tiền mời (sếp mời 500k). Vẫn tick thì góp thêm phần chia đều; bỏ tick thì chỉ chịu phần riêng.
  - **Mời riêng** — phần chia đều của người được mời chuyển sang người mời.
- Gõ tiền kiểu `300.000`, `500k`, `2tr`, `1,5tr`.
- **Bàn phím:** mỗi ô là một điểm dừng Tab; mũi tên đi giữa các ô; Space tick; gõ số (hoặc Enter) mở ô nhập với "Đã trả". Trong ô nhập, Enter lưu và xuống người kế tiếp (hết cột sang khoản kế, hết bảng tới "+ Khoản"); Shift+Enter đi lên; Esc đóng. Enter ở tên buổi → tên người đầu; tên người → người kế (người cuối thì thêm người mới); tên khoản → ô đầu của cột đó.
- Ba cột cuối: Đã trả, Phải chịu, Còn lại (+ được nhận, − phải trả). Dư lẻ đồng cộng cho người đầu danh sách.
- Khoản nhập mâu thuẫn được viền đỏ, ghi lý do và tạm không tính.
- **Chứng từ thanh toán**: một khu tải ảnh chung cho cả buổi (hóa đơn, biên lai, ảnh chuyển khoản). Ảnh được đánh mã `CT1`, `CT2`… theo thứ tự tải lên và in kèm trên hóa đơn, xếp nhiều cột cho gọn (ảnh nào xuống cột đang ngắn nhất, không cắt ảnh). Ảnh nén còn ≤1600px và lưu trong IndexedDB của trình duyệt.
- **Thông tin chuyển khoản**: người nhận, ngân hàng, số tài khoản, chủ tài khoản, nội dung CK và ảnh QR (in ở cuối ảnh hóa đơn). Lưu riêng, vẫn giữ khi bấm "Buổi mới".
- Các bản xuất đều giữ đủ thông tin như trên bảng (tick, trả / riêng / mời, Đã trả, Phải chịu, Còn lại), không cắt chữ:
  - **Xuất hóa đơn (HTML)**: theo `hoa-don-template.html`, in hoặc lưu PDF được. Một bảng lưới duy nhất như trên UI; nhiều khoản thì trang (và khổ in) rộng ra, không tách bảng. Có trang "Chứng từ thanh toán" nếu có ảnh.
  - **Xuất ảnh hóa đơn**: PNG có bảng lưới giống UI (tick, nhãn, Đã trả / Phải chịu / Còn lại, Tổng). Ảnh rộng ra theo số khoản, cao ra theo số người, chữ dài tự xuống dòng. Có ô tick "Kèm ảnh chứng từ". Các nút: Sao chép ảnh, Tải ảnh, Chia sẻ.
  - **Xuất Excel**: sheet Bảng chia (giống bảng trên UI, có màu), Phần chia và Chi tiết. File do `xlsx.js` tự tạo, không dùng thư viện.
  - **Sao chép dạng chữ**.

### Quy tắc đặt tên (`naming.js`)

| | Quy tắc | Ví dụ |
|---|---|---|
| Mã hóa đơn | `CTN-YYMMDD-NN`: ngày lập + số thứ tự trong ngày (01, 02 … 99, 100 …). Cấp **một lần** khi xuất lần đầu của buổi, xuất lại vẫn giữ mã. Bấm "Buổi mới" thì buổi sau có mã mới. Bộ đếm ngày lưu trong trình duyệt, qua ngày tự về 01. | `CTN-261123-01` |
| Ngày lập | Ngày giờ lúc cấp mã, cố định cùng mã. Hiện ở đầu hóa đơn. | `23/11/2026 17:20` |
| Timestamp xuất | Giờ máy, đến giây, đổi theo từng lần xuất. Hiện ở cuối hóa đơn (`Xuất lúc`) và nằm trong tên file. | `17:20:45 23/11/2026` |
| Tên file | `{mã}_{tên buổi không dấu}_{YYYYMMDD-HHmmss}.{đuôi}`: xếp theo tên là ra đúng thứ tự thời gian, không đè file cũ. | `CTN-261123-01_di-bien-cuoi-tuan_20261123-172045.xlsx` |
| Mã chứng từ | `CT1`, `CT2` … theo thứ tự tải ảnh lên. | `CT3` |
| Nội dung CK mặc định | `CTN {2 từ đầu tên buổi} {ddmm} + tên bạn` | `CTN DIBIEN 2311 + tên bạn` |

Logo và icon nằm ở `docs/tools/expense-splitter/assets/` (bản gốc: `app-chi-tien-logo/`). Bảng màu lấy từ logo: xanh ngọc `#0b6f73` và vàng nâu `#c9862f`; font Lexend.

Ví dụ: hóa đơn 2.000.000, 4 người, sếp mời 500.000 và vẫn tick → sếp chịu 875.000, mỗi người còn lại 375.000.

## Chạy và kiểm tra

Cần Node.js.

```sh
npx serve docs          # mở http://localhost:3000/
node --test tests/      # chạy test
```

Phải mở qua server (không double-click file) vì trang dùng ES modules. GitHub Pages dùng nguồn `main`, thư mục `/docs`.

Thêm công cụ mới trong `docs/tools/<ten-cong-cu>/` rồi thêm liên kết tương đối trong `docs/index.html`.
