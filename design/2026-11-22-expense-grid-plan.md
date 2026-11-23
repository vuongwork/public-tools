# Chia Tiền Nhóm dạng grid — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Thay giao diện form của `docs/tools/expense-splitter/` bằng một bảng người × khoản chi, nhập trực tiếp trên ô (checkbox + popover), hỗ trợ góp không đều, mời (trừ trước), mời riêng, nhiều người cùng trả.

**Architecture:** Logic thuần tách khỏi DOM: `calculate.js` (tính tiền), `trip.js` (dữ liệu + thao tác bất biến + chuyển dữ liệu cũ), `format.js` (parse/hiển thị tiền). `app.js` chỉ render bảng từ state và gọi các thao tác trong `trip.js`, rồi lưu `localStorage`. Mọi thay đổi → `render()` lại toàn bộ bảng (dữ liệu nhỏ, không cần diff).

**Tech Stack:** HTML/CSS/JS thuần (ES modules), `node --test`, GitHub Pages từ `docs/`.

**Spec:** `design/2026-11-22-expense-grid-design.md`

## Global Constraints

- Không thêm thư viện/bundler. Chạy được bằng `npx serve docs`.
- Tiền là số nguyên đồng; mọi phép chia dùng `Math.floor`, dư đồng cộng lần lượt cho người đầu danh sách (theo thứ tự `members`) trong số người được chia.
- Tổng "phải chịu" của mỗi khoản hợp lệ luôn bằng đúng tổng khoản.
- Chữ trên giao diện bằng tiếng Việt.
- Key lưu mới: `public-tools:expense-splitter:v2`; vẫn đọc được `...:v1` (định dạng `{amount, payer, participants}`).
- Thư mục chưa phải git repo: nếu chưa `git init` thì bỏ qua các bước commit.

## Review Focus

1. Xóa một người đang được tham chiếu trong `treats` của người khác → phải gỡ khỏi `treats`, không để cột bị lỗi ma. (Test ở Task 2.)
2. Người dùng gõ tiền kiểu Việt: `500k`, `2tr`, `1,5tr`, `1.5tr`, `2.000.000` → phải hiểu đúng. (Test ở Task 3.)
3. Xóa trắng ô "Đã trả"/"Mời" → coi là 0, không báo lỗi. (Test ở Task 3.)
4. Cột lỗi không được làm sai tổng kết của các cột khác. (Test ở Task 1.)
5. Dữ liệu `localStorage` hỏng/không đúng định dạng → bắt đầu buổi trống và báo một dòng, không crash. (Test ở Task 2.)

---

### Task 1: Logic tính tiền theo ô (`calculate.js`)

**Files:**
- Modify: `docs/tools/expense-splitter/calculate.js` (viết lại `calculate`, giữ thuật toán ghép chuyển khoản hiện có; chuyển `parseAmount` sang Task 3)
- Test: `tests/calculate.test.mjs` (thay `tests/expense-splitter.test.mjs`; port các test settlement cũ sang định dạng `cells`)

**Interfaces:**
- Produces:
  - `type Cell = { on: boolean, paid: number, extra: number, treats: string[] }` (thiếu trường → `on:false, paid:0, extra:0, treats:[]`)
  - `type Expense = { id: string, name: string, cells: Record<memberId, Cell> }`
  - `calculateExpense(members, expense) -> { total: number, paid: Record<id,number>, share: Record<id,number>, error: string | null }`
  - `calculate(members, expenses) -> { total, balances: [{id, name, paid, share, net}], transfers: [{from, to, amount}], errors: Record<expenseId, string> }` — khoản có `error` bị loại khỏi `total`/`balances`.

Thuật toán `calculateExpense` (đúng thứ tự):
```
total = Σ paid; extras = Σ extra
if extras > total            → error "Tiền mời/chịu thêm lớn hơn tổng khoản."
pool = total - extras
ticked = members (theo thứ tự) có on
if pool > 0 && ticked rỗng   → error "Chưa ai được tick để chia phần còn lại."
equal[i] = floor(pool/n) (+1 cho r người đầu)    // chỉ người ticked
mời riêng, với mỗi người A có treats:
  A không tick               → error "<A> mời riêng nhưng chưa tick."
  B trong treats không tick  → error "<B> được mời nhưng chưa tick."
  B bị hai người mời         → error "<B> được hai người mời."
  B cũng có treats (lồng/vòng) → error "<B> vừa được mời vừa mời người khác."
  A === B hoặc id lạ         → bỏ qua
  equal[A] += equal[B]; equal[B] = 0
share[i] = equal[i] + extra[i]
```
Khoản không có ai trả và không ai tick → hợp lệ, total 0.

- [ ] **Step 1: Viết test thất bại** trong `tests/calculate.test.mjs`, với `members = Sếp, An, Bình, Chi` (id `"s","a","b","c"`):
  - `"sếp mời 500k, có tick, vẫn góp phần chia đều"`: sếp `paid 2_000_000, extra 500_000`, cả 4 tick → share `{s:875000, a:375000, b:375000, c:375000}`.
  - `"sếp mời 500k, bỏ tick"`: như trên nhưng sếp `on:false` → `{s:500000, a:500000, b:500000, c:500000}`.
  - `"nhiều người cùng trả"`: s paid 100, a paid 200, 3 người tick → `total 300`, paid đúng từng người.
  - `"mời riêng chuyển phần của người được mời"`: total 400, 4 tick, a `treats:["c"]` → `{s:100,a:200,b:100,c:0}`.
  - `"dư đồng chia theo thứ tự thành viên"`: total 101 tick b,c → b 51, c 50.
  - `"tổng phải chịu bằng tổng khoản"`: với mọi ca hợp lệ ở trên, `Σ share === total`.
  - `"báo lỗi"`: lần lượt 5 ca lỗi ở thuật toán → `error` đúng chuỗi.
  - `"khoản lỗi không ảnh hưởng tổng kết"`: `calculate` với 1 khoản hợp lệ + 1 khoản lỗi → `balances` bằng kết quả chỉ có khoản hợp lệ, `errors` có id khoản lỗi.
  - Port 3 test chuyển khoản cũ (nhiều chủ nợ, cân bằng 0 → `transfers []`, thứ tự) sang `cells`, giữ nguyên kết quả mong đợi.
- [ ] **Step 2:** `node --test tests/` → FAIL (`calculateExpense is not a function`).
- [ ] **Step 3:** Cài đặt `calculateExpense`, `calculate` trong `calculate.js`, tách hàm ghép chuyển khoản cũ thành `settle(balances) -> transfers` (giữ thuật toán).
- [ ] **Step 4:** `node --test tests/` → PASS. Xóa `tests/expense-splitter.test.mjs`.
- [ ] **Step 5:** Commit `feat(expense-splitter): per-cell calculation with treats and extras`.

### Task 2: Dữ liệu buổi và thao tác (`trip.js`)

**Files:**
- Create: `docs/tools/expense-splitter/trip.js`
- Test: `tests/trip.test.mjs`

**Interfaces:**
- Consumes: kiểu `Expense`, `Cell` từ Task 1.
- Produces (mọi hàm trả về trip **mới**, không sửa đầu vào):
  - `emptyTrip() -> { name: "", members: [], expenses: [] }`
  - `addMember(trip, name)`, `renameMember(trip, id, name)`, `removeMember(trip, id)` — xóa luôn cell của người đó và gỡ id khỏi mọi `treats`.
  - `addExpense(trip, name)` — cột mới, mọi người mặc định `on: true`.
  - `renameExpense(trip, id, name)`, `removeExpense(trip, id)`
  - `setCell(trip, expenseId, memberId, patch: Partial<Cell>)`
  - `addMember` cho khoản đã có: người mới `on: false` ở các cột cũ.
  - `loadTrip(v2Json: string | null, v1Json: string | null) -> { trip, warning: string | null }` — ưu tiên v2; không có thì chuyển v1 (`payer` → `paid: amount`; `participants` → `on: true`); hỏng → `emptyTrip()` + warning `"Không thể đọc buổi đã lưu trên trình duyệt này."`
  - id sinh bằng `crypto.randomUUID()`.

- [ ] **Step 1: Viết test thất bại:**
  - `"removeMember gỡ khỏi treats"`: a treats `["c"]`, xóa c → cell a `treats: []`, không còn key `c` trong `cells`, và `calculate` không có lỗi.
  - `"addExpense tick sẵn mọi người"`, `"addMember không tick ở cột cũ"`.
  - `"không sửa trip đầu vào"`: `Object.freeze` sâu trip đầu vào, gọi mọi thao tác không throw.
  - `"chuyển dữ liệu v1"`: `{amount:300000, payer:"0", participants:["0","1"]}` → cell 0 `{on:true, paid:300000}`, cell 1 `{on:true, paid:0}`; kết quả `calculate` bằng bản cũ (100000/200000… như test cũ).
  - `"dữ liệu hỏng"`: `loadTrip("{oops", null)` và `loadTrip('{"members":5}', null)` → trip trống + đúng chuỗi warning.
- [ ] **Step 2:** `node --test tests/` → FAIL.
- [ ] **Step 3:** Cài đặt `trip.js`.
- [ ] **Step 4:** `node --test tests/` → PASS.
- [ ] **Step 5:** Commit `feat(expense-splitter): immutable trip operations and v1 migration`.

### Task 3: Parse và hiển thị tiền (`format.js`)

**Files:**
- Create: `docs/tools/expense-splitter/format.js` (chuyển `parseAmount` từ `calculate.js` sang)
- Test: `tests/format.test.mjs`

**Interfaces:**
- Produces:
  - `parseAmount(text) -> number | null` — `""`/chỉ khoảng trắng → `0`; số âm, số lẻ dưới 1 đồng, vượt `MAX_SAFE_INTEGER` → `null`.
  - `money(n) -> "2.000.000 ₫"` (Intl vi-VN).
  - `shortMoney(n) -> string` cho nhãn ô: `2000000 → "2tr"`, `1500000 → "1,5tr"`, `500000 → "500k"`, `80000 → "80k"`, `1234 → "1.234"`.

- [ ] **Step 1: Viết test thất bại:**
  - Chấp nhận: `"300000","300.000","300,000","300 000"` → 300000; `"500k","500K"` → 500000; `"2tr","2 tr"` → 2000000; `"1,5tr","1.5tr"` → 1500000; `""` → 0.
  - Từ chối: `"-1","30.00","1.000,00","abc","1,2345tr","9007199254740992"` → null.
  - `shortMoney` với 5 giá trị trên.
- [ ] **Step 2:** FAIL. **Step 3:** cài đặt. **Step 4:** `node --test tests/` → PASS.
- [ ] **Step 5:** Commit `feat(expense-splitter): VND parsing with k/tr suffixes`.

### Task 4: Bảng grid cơ bản (`index.html`, `app.js`, `style.css`)

**Files:**
- Modify: `docs/tools/expense-splitter/index.html` (bỏ form thành viên/khoản; giữ header, tên buổi, nút "Buổi mới", status, vùng chuyển khoản + sao chép)
- Rewrite: `docs/tools/expense-splitter/app.js`, `docs/tools/expense-splitter/style.css`

**Interfaces:**
- Consumes: toàn bộ `trip.js`, `calculate`, `money`.
- Produces: `render()` dựng lại `<table id="grid">`; hàm `update(fn)` = `trip = fn(trip); save(); render()`.

Cấu trúc bảng:
- `thead` hàng 1: ô trống | mỗi khoản: `<input>` tên (sửa tại chỗ, lưu khi `change`) + nút `⋯` (menu "Xóa khoản") | nút `+ Khoản` | `Đã trả` | `Phải chịu` | `Còn lại`.
- `thead` hàng 2: tổng từng khoản (`money(total)`), cột lỗi hiện chữ đỏ lý do.
- `tbody`: mỗi người một hàng: `<input>` tên + nút `⋯` ("Xóa người") | mỗi khoản một ô có `<input type="checkbox">` (aria-label `"<người> tham gia <khoản>"`) | ô trống | 3 cột tổng (Còn lại: dương xanh "nhận", âm đỏ "trả").
- Hàng cuối: nút `+ Người` (tạo người tên "Người N", focus vào input tên).
- Cột tên `position: sticky; left: 0`; bảng nằm trong vùng `overflow-x: auto`; không có cuộn ngang cả trang ở 360px.
- Cột có lỗi: class `has-error` (viền đỏ).

- [ ] **Step 1:** Viết `index.html` + `app.js` + `style.css` như trên.
- [ ] **Step 2: Kiểm tra trên trình duyệt** (`npx serve docs`, mở `/tools/expense-splitter/`): thêm 4 người, 2 khoản; đổi tên; bỏ tick; xóa người/khoản; tải lại trang thì dữ liệu còn; ở độ rộng 360px cột tên dính trái và chỉ bảng cuộn ngang.
- [ ] **Step 3:** `node --test tests/` vẫn PASS.
- [ ] **Step 4:** Commit `feat(expense-splitter): editable person × expense grid`.

### Task 5: Popover chi tiết ô và nhãn

**Files:**
- Modify: `docs/tools/expense-splitter/app.js`, `style.css`, `index.html` (thêm một `<div id="cell-popover" hidden>` dùng chung)

**Interfaces:**
- Consumes: `setCell`, `parseAmount`, `shortMoney`.

Hành vi:
- Bấm vào ô (không phải checkbox) → mở popover định vị cạnh ô, tiêu đề `"<người> · <khoản>"`, gồm:
  - `Đã trả` (`inputmode="text"`, nhận `500k`/`2tr`), `Mời / chịu thêm` (như trên), `Mời riêng cho` (danh sách checkbox những người khác).
  - Gợi ý một dòng: "Có tick: vẫn góp phần chia đều. Bỏ tick: tiền mời là toàn bộ phần của bạn."
- Mỗi lần `input` hợp lệ → `setCell` + render bảng (popover giữ mở, focus giữ nguyên). Không hợp lệ → viền đỏ ô nhập, không lưu.
- Đóng bằng Esc, bấm ra ngoài, hoặc nút "Xong"; khi đóng, focus trả về ô.
- Nhãn trong ô (dưới checkbox), mỗi nhãn một dòng: `trả <shortMoney>`, `mời <shortMoney>`, `mời <tên>[, <tên>]`.

- [ ] **Step 1:** Cài đặt popover + nhãn.
- [ ] **Step 2: Kiểm tra trên trình duyệt** bằng đúng ví dụ trong spec: 4 người, khoản "Ăn tối", Sếp trả `2tr`, mời `500k`, tất cả tick → Sếp phải chịu 875.000, mỗi người 375.000. Bỏ tick Sếp → 500.000 mỗi người. Đặt mời 3tr → cột viền đỏ, có lý do, tổng kết bỏ khoản này. An mời riêng Chi → Chi chịu 0, nhãn "mời Chi" hiện ở ô An.
- [ ] **Step 3:** Dùng bàn phím: Tab tới ô, Enter mở popover, Esc đóng.
- [ ] **Step 4:** Commit `feat(expense-splitter): cell popover for paid, treat and private treat`.

### Task 6: Chuyển khoản, sao chép, README

**Files:**
- Modify: `docs/tools/expense-splitter/app.js` (danh sách chuyển khoản + text sao chép từ `calculate().transfers`, giữ fallback textarea hiện có), `README.md` (mô tả quy tắc mới: chia đều, mời trừ trước, mời riêng, nhiều người trả; nhập `500k`/`2tr`; lệnh test `node --test tests/`)

- [ ] **Step 1:** Text sao chép có dạng:
  ```
  <Tên buổi> — tổng <money>
  <Người>: trả <money>, chịu <money>, còn <+/-money>
  ...
  Chuyển khoản:
  <A> → <B>: <money>
  ```
  Có khoản lỗi thì thêm dòng `Bỏ qua (lỗi): <tên khoản>`.
- [ ] **Step 2:** Kiểm tra trên trình duyệt: sao chép, dán ra kiểm tra nội dung; "Buổi mới" xóa sạch.
- [ ] **Step 3:** `node --test tests/` → PASS.
- [ ] **Step 4:** Commit `feat(expense-splitter): settlement summary and docs`.
