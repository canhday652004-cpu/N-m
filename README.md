# ShopVN — Web bán hàng có trang quản trị

Website bán hàng hoàn chỉnh: khách xem sản phẩm và đặt hàng, quản trị viên **thêm / sửa / xoá**
sản phẩm, danh mục và đơn hàng.

Viết bằng **Node.js thuần** — không cần `npm install`, không phụ thuộc thư viện ngoài.
Dữ liệu lưu trong SQLite (module `node:sqlite` có sẵn từ Node 22.5).

## Chạy thử

```bash
node server/index.js
```

Sau đó mở:

| Trang | Địa chỉ |
| --- | --- |
| Cửa hàng | http://localhost:3000 |
| Quản trị | http://localhost:3000/admin |

Lần chạy đầu tiên server tự tạo CSDL, nạp 8 sản phẩm mẫu trong 4 danh mục và in ra tài khoản quản trị.

**Tài khoản mặc định: `admin` / `admin123`.**
Đổi bằng biến môi trường **trước lần chạy đầu tiên**:

```bash
ADMIN_USER=sep ADMIN_PASSWORD='mat-khau-that-manh' node server/index.js
```

Các biến môi trường khác: `PORT` (mặc định 3000), `HOST` (mặc định 0.0.0.0), `DB_PATH`.

## Tính năng

**Phía khách hàng**
- Danh sách sản phẩm, tìm kiếm theo tên và lọc theo danh mục
- Giỏ hàng lưu trong `localStorage` (không mất khi tải lại trang)
- Đặt hàng kèm thông tin giao hàng, nhận mã đơn dạng `DH20260909-12345`
- Sản phẩm hết hàng hoặc bị ẩn không thể đặt

**Trang quản trị** (`/admin`, phải đăng nhập)
- **Tổng quan**: số sản phẩm, danh mục, đơn hàng, doanh thu, sản phẩm hết hàng
- **Sản phẩm**: thêm, sửa, xoá, bật/tắt hiển thị, tìm kiếm
- **Danh mục**: thêm, sửa, xoá (chặn xoá khi còn sản phẩm bên trong)
- **Đơn hàng**: xem chi tiết, đổi trạng thái, xoá, lọc theo trạng thái

## Kiểm thử

```bash
node --test test/*.test.js
```

19 test bao phủ đăng nhập, phân quyền, CRUD sản phẩm/danh mục, đặt hàng, trừ tồn kho và
chặn path traversal.

## API

Công khai:

| Method | Endpoint | Mô tả |
| --- | --- | --- |
| `GET` | `/api/products?q=&category=` | Sản phẩm đang bán |
| `GET` | `/api/products/:id\|:slug` | Chi tiết sản phẩm |
| `GET` | `/api/categories` | Danh sách danh mục |
| `POST` | `/api/orders` | Đặt hàng |
| `GET` | `/api/meta` | Danh sách trạng thái đơn |

Xác thực:

| Method | Endpoint |
| --- | --- |
| `POST` | `/api/auth/login` |
| `POST` | `/api/auth/logout` |
| `GET` | `/api/auth/me` |

Quản trị (cần cookie phiên, trả `401` nếu chưa đăng nhập):

| Method | Endpoint |
| --- | --- |
| `GET` | `/api/admin/stats` |
| `GET` `POST` | `/api/admin/products` |
| `GET` `PUT` `DELETE` | `/api/admin/products/:id` |
| `GET` `POST` | `/api/admin/categories` |
| `PUT` `DELETE` | `/api/admin/categories/:id` |
| `GET` | `/api/admin/orders?status=` |
| `GET` `DELETE` | `/api/admin/orders/:id` |
| `PUT` | `/api/admin/orders/:id/status` |

Trạng thái đơn: `pending`, `confirmed`, `shipping`, `done`, `cancelled`.

## Cấu trúc

```
server/
  index.js          HTTP server, xử lý lỗi, phục vụ file tĩnh
  db.js             Lược đồ SQLite
  seed.js           Dữ liệu mẫu
  lib/
    auth.js         Băm mật khẩu (scrypt) + phiên đăng nhập
    http.js         Đọc body, gửi JSON, cookie, lớp HttpError
    static.js       Phục vụ file tĩnh (chặn path traversal)
    validate.js     Kiểm tra dữ liệu đầu vào + tạo slug tiếng Việt
  routes/
    api.js          Định tuyến /api/*
    products.js     CRUD sản phẩm & danh mục
    orders.js       Đơn hàng và thống kê
public/
  index.html        Cửa hàng
  admin.html        Trang quản trị
  css/styles.css    Giao diện (hỗ trợ sáng/tối theo hệ thống)
  js/{common,store,admin}.js
test/api.test.js
```

## Ghi chú bảo mật

Đã xử lý trong mã nguồn:
- Mật khẩu băm bằng `scrypt` kèm salt, so sánh bằng `timingSafeEqual`
- Cookie phiên `HttpOnly` + `SameSite=Lax`, hết hạn sau 8 giờ
- Giới hạn 10 lần đăng nhập sai mỗi IP trong 15 phút
- Mọi truy vấn dùng câu lệnh tham số hoá (không nối chuỗi SQL)
- Giá đơn hàng luôn lấy từ CSDL, bỏ qua giá client gửi lên; trừ tồn kho trong một transaction
- Dữ liệu hiển thị đều được escape trước khi chèn vào HTML
- Chặn path traversal khi phục vụ file tĩnh

Trước khi đưa lên môi trường thật, cần bổ sung:
- Chạy sau HTTPS và thêm cờ `Secure` cho cookie
- Lưu phiên vào CSDL thay vì bộ nhớ (hiện restart server là mất phiên)
- Thêm CSRF token cho các thao tác ghi
