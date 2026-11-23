<p align="center">
  <img src="docs/assets/brand/vuong-logo.svg" width="96" height="96" alt="Vuong">
  <br>
  By @vuongwork
</p>

# Public Tools

Bộ công cụ chạy trên trình duyệt, dùng HTML, CSS và JavaScript thuần (không build, không thư viện). Dữ liệu lưu ngay trong trình duyệt của bạn.

## Danh sách tool

|  | Tool                       | Mô tả ngắn                                                                                                            | Thư mục                                                       | Tài liệu                                     |
| - | -------------------------- | ------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------- | ---------------------------------------------- |
| <img src="docs/tools/expense-splitter/assets/logo.svg" width="48" height="48" alt="Chia Tiền Nhóm"> | **Chia Tiền Nhóm** | Chia chi phí nhóm trên một bảng người × khoản chi; tính ai chuyển cho ai; xuất hóa đơn HTML, ảnh, Excel. | [`docs/tools/expense-splitter/`](docs/tools/expense-splitter/) | [README](docs/tools/expense-splitter/README.md) |

## Chạy và kiểm tra

Cần Node.js.

```sh
npx serve docs          # mở http://localhost:3000/
node --test tests/      # chạy test
```

Phải mở qua server (không double-click file) vì trang dùng ES modules. GitHub Pages dùng nguồn `main`, thư mục `/docs`.

## Thêm tool mới

1. Tạo `docs/tools/<ten-cong-cu>/` (có `index.html`, thêm `assets/logo.svg` làm avatar).
2. Thêm liên kết tương đối trong `docs/index.html`.
3. Thêm một dòng vào bảng trên.
