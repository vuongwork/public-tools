# Chia Tiền Nhóm — thiết kế lại dạng bảng grid

## Mục đích
Nhìn một bảng là biết: ai đã góp khoản nào, mỗi người tổng đã trả / phải chịu / còn lại bao nhiêu.
Sửa thông tin thu chi **ngay trên ô của bảng**, không qua form riêng. Bảng tính lại tức thì.

## Mục tiêu / không làm / thất bại
- **Làm:** bảng người × khoản chi; checkbox là cách nhập chính; hỗ trợ góp không đều, mời (trừ trước), mời riêng, nhiều người cùng trả; gợi ý chuyển khoản; sao chép kết quả.
- **Không làm:** tài khoản, đồng bộ nhiều máy, nhiều loại tiền, quỹ nhóm / đã trả một phần (để sau).
- **Thất bại nếu:** phải mở form/modal mới nhập được khoản bình thường; bảng chật đến mức không đọc được trên điện thoại; số tổng lệch dù chỉ 1 đồng.

## Ràng buộc
- HTML/CSS/JS thuần, chạy GitHub Pages từ `docs/` như hiện tại. Lưu `localStorage`.
- Giữ cấu trúc repo `docs/tools/expense-splitter/`, test bằng `node --test`.
- Tiền là số nguyên đồng.

## Các cách đã cân nhắc
- **A. Checkbox, bấm ô mới mở chi tiết (đã chọn).** Ô mặc định chỉ là checkbox; số đặc biệt hiện thành nhãn nhỏ. Gọn, checkbox là chính, vẫn đủ mọi case.
- B. Mỗi ô luôn có 2 ô nhập (trả/chịu): thấy hết nhưng nặng, chật trên điện thoại — giống bản Codex bị chê.
- C. Checkbox + số phần (×2): nhanh nhưng không biểu diễn được "mời 500k" hay "gọi thêm 80k".

## Bố cục
```
              | Ăn tối      | Taxi       | + Khoản | Đã trả  | Phải chịu | Còn lại
              | 2.000.000   | 120.000    |         |         |           |
Sếp           | [x] trả 2tr | [ ]        |         | 2.000.000 |  ...    | +...
              |   mời 500k  |            |         |
An            | [x]         | [x] trả120k|         |
Bình          | [x] mời Chi | [x]        |         |
Chi           | [x]         | [x]        |         |
+ Người
```
- Hàng = người (tên sửa tại chỗ), cột = khoản chi (tên sửa tại chỗ, tổng tự tính). Nút "+ Người", "+ Khoản".
- 3 cột tổng cuối: Đã trả, Phải chịu, Còn lại (dương = được nhận, âm = phải trả).
- Cột tên dính trái, cuộn ngang trên điện thoại.
- Dưới bảng: gợi ý chuyển khoản + nút sao chép kết quả (giữ logic hiện có).

## Ô (người × khoản)
- **Checkbox "tham gia"**: tick = có phần trong khoản này.
- **Bấm vào ô (ngoài checkbox)** mở popover nhỏ ngay tại ô, gồm:
  - **Đã trả**: số tiền người này đã thanh toán cho khoản. Nhiều người có thể cùng nhập.
  - **Phần riêng** (trước đây gọi "Mời / chịu thêm"): số tiền người này gánh trước — món riêng giá khác nhau, gọi thêm món 80k, sếp mời 500k.
  - **Mời riêng**: chọn một hoặc nhiều người; phần chia đều của họ chuyển sang người mời.
- Ô hiển thị nhãn ngắn khi có số: `trả 2tr`, `riêng 500k`, `mời Chi`.

## Quy tắc tính cho một khoản
1. **Tổng khoản** = tổng các ô "Đã trả".
2. **Phần chia đều** = Tổng khoản − tổng "Phần riêng".
3. Chia đều phần đó cho những người có tick (dư đồng cộng cho người đầu danh sách, như hiện tại).
4. Phải chịu của mỗi người = phần chia đều + "Phần riêng" của họ.
   - Tiền mời là khoản riêng: người mời **có tick** thì vẫn góp phần chia đều sau đó; **bỏ tick** thì tiền mời là toàn bộ phần của họ.
   - Ví dụ: bill 2.000.000, 4 người, sếp mời 500.000 → sếp tick: sếp 875.000, mỗi người 375.000; sếp bỏ tick: sếp 500.000, 3 người còn lại mỗi người 500.000.
5. **Mời riêng:** phần chia đều của người được mời cộng sang người mời; người được mời chịu 0 (trừ "Phần riêng" của chính họ, nếu có).
6. Tổng "phải chịu" của khoản luôn bằng tổng khoản (test bắt buộc).

**Báo lỗi ngay trên cột** (viền đỏ + lý do, không chặn nhập):
- Tổng "Phần riêng" lớn hơn tổng khoản.
- Còn phần chia đều nhưng không ai tick.
- Người mời riêng không tick, hoặc mời vòng (A mời B, B mời A).
Cột lỗi bị loại khỏi tổng kết cho đến khi sửa.

## Dữ liệu
```js
{ name, members: [{id, name}],
  expenses: [{ id, name,
    cells: { [memberId]: { on: bool, paid: int, extra: int, treats: [memberId] } } }] }
```
Đọc được dữ liệu cũ (payer + participants) bằng cách chuyển sang `cells`.

## Để người làm tự quyết
Style cụ thể, cách đóng popover (Esc / bấm ra ngoài), phím tắt, cách xóa hàng/cột (menu nhỏ ở tiêu đề), định dạng số khi nhập.
