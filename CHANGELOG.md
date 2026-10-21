# Changelog

Mọi thay đổi đáng chú ý của DSA FlowLab được ghi tại đây.

## v0.1.0-p0 — Đã chuẩn bị, chưa phát hành

- Trực quan hóa từng bước luồng C++ mẫu: stack, heap, con trỏ và topology danh sách liên kết đơn.
- Snapshot trước câu lệnh; theo dõi allocation/deallocation NODE trong các trường hợp đã kiểm thử; stdout còn trong buffer được trả riêng dưới dạng output cuối.
- Giao diện học tiếng Việt, chế độ Tập sự/Chuyên sâu, editor C++ và stdin.
- Gắn trace với snapshot code/stdin và request ID; response cũ không thay kết quả của đầu vào hiện tại.
- So khớp Host header theo hostname local chính xác và từ chối tên giả dạng localhost.
- Đồng bộ package root, client và server với phiên bản prerelease `0.1.0-p0`.

Trạng thái: chờ CI candidate, review PR và phê duyệt của con người. Chưa tạo tag hoặc GitHub Release.
