# 🚀 DriveMerge - รายการฟีเจอร์และแผนพัฒนา (Feature Roadmap)

เอกสารนี้รวบรวมฟีเจอร์ ไอเดีย และแผนพัฒนาที่ตอบโจทย์การใช้งานจริงสำหรับ **DriveMerge** (เว็บแอปจัดการและรวมบัญชี Google Drive หลายบัญชีไว้ในที่เดียว) โดยแบ่งออกตามหมวดหมู่และระดับความสำคัญ

---

## 📌 สถานะฟีเจอร์ปัจจุบัน (Current Implemented Features)
- [x] **Google OAuth 2.0 Multi-Account**: เข้าสู่ระบบและเชื่อมต่อบัญชี Google Drive หลายบัญชีพร้อมกัน
- [x] **Merged Storage Quota**: คำนวณและแสดงผลพื้นที่จัดเก็บรวม (Total Capacity) และพื้นที่ใช้งานรวม (Total Usage) จากทุกบัญชี
- [x] **Smart File Upload**: ระบบอัปโหลดไฟล์อัจฉริยะที่เลือกลงบัญชี Google Drive ที่มีพื้นที่ว่างเหลือมากที่สุดโดยอัตโนมัติ
- [x] **Unified File Browser**: หน้าจอรวมไฟล์จากทุกบัญชี เรียงลำดับตามเวลาล่าสุด พร้อมไอคอนและพรีวิวประเภทไฟล์
- [x] **Basic Search**: ค้นหาไฟล์ตามชื่อแบบเรียลไทม์
- [x] **Cross-Account File Transfer**: ย้ายไฟล์ (Move) หรือคัดลอกไฟล์ (Copy) จาก Drive ของบัญชี A ไปยัง Drive ของบัญชี B ได้โดยตรงโดยไม่ต้องดาวน์โหลดลงเครื่อง
- [x] **Batch File Operations**: เลือกลบ ย้าย หรือดาวน์โหลดไฟล์หลายรายการพร้อมกันข้ามหลายบัญชี
- [x] **Download as ZIP (Multi-Account)**: เลือกไฟล์จากคนละบัญชีแล้วรวมดาวน์โหลดเป็นไฟล์ ZIP ไฟล์เดียว
- [x] **Account Tag / Badge บนการ์ดไฟล์**: แสดงป้ายกำกับรูปโปรไฟล์หรืออีเมลเจ้าของไฟล์บนการ์ดไฟล์อย่างชัดเจน เพื่อให้รู้ว่าไฟล์นี้อยู่ในบัญชีไหน
- [x] **Filter by Account**: ตัวกรองสำหรับเลือกดูเฉพาะไฟล์ของบัญชีที่ต้องการ หรือดูรวมทั้งหมด
- [x] **Large Files Analyzer**: หน้ารวมไฟล์ขนาดใหญ่สุด (Top 50 Largest Files) จากทุกไดรฟ์ เพื่อให้ผู้ใช้ตัดสินใจเคลียร์พื้นที่ได้ง่าย
- [x] **Trash Cleaner Across Drives**: ตรวจสอบและสั่งล้างถังขยะ (Empty Trash) ของทุกบัญชีพร้อมกันในคลิกเดียว
- [x] **Breadcrumbs Navigation**: แถบนำทางแสดงเส้นทางของโฟลเดอร์ ช่วยให้กดถอยกลับได้ง่าย
- [x] **File Starred / Favorites**: ปักหมุดไฟล์ที่ใช้งานบ่อย รวมไฟล์ดาวเด่นจากทุกบัญชีไว้ในแท็บ "Favorites"
- [x] **In-App File Previewer**: ดูตัวอย่างวิดีโอ (Video Player ในตัว) และเปิดดู Text file / PDF แบบ Inline
- [x] **Revoke & Disconnect Account**: ปุ่มกดยกเลิกการเชื่อมต่อบัญชีใดบัญชีหนึ่ง
- [x] **Account Health Check**: ตรวจสอบสถานะการเชื่อมต่อของแต่ละบัญชี แสดง Expired Badge หาก Token หมดอายุ
- [x] **Activity Log / Audit Trail**: ประวัติบันทึกการกระทำต่างๆ

---

## 💡 หมวดหมู่ที่ 1: การจัดการไฟล์ข้ามบัญชี (Cross-Account File Management)
3. **Cross-Account Folder Sync**: ซิงค์โฟลเดอร์ระหว่าง 2 บัญชีแบบสองทาง (Two-Way Sync) หรือทิศทางเดียว (One-Way Backup)
4. **File Splitter / Large File Management**: สำหรับไฟล์ขนาดใหญ่เกินโควต้าบัญชีเดียว สามารถเลือกบัญชีปลายทางที่เหมาะสมก่อนอัปโหลด หรือแจ้งเตือนความจุล่วงหน้า

---

## 💡 หมวดหมู่ที่ 2: การเพิ่มประสิทธิภาพพื้นที่จัดเก็บ (Storage Optimization & Cleaner)
28: 8. **Cross-Drive Duplicate Finder**: สแกนหาไฟล์ซ้ำ (Duplicate Files) ที่มีชื่อ, ขนาด, หรือ MD5 Hash ตรงกันข้ามบัญชี เพื่อช่วยลดการใช้พื้นที่โดยไม่จำเป็น
11. **Storage Balancing Recommender**: ระบบวิเคราะห์และแนะนำการย้ายไฟล์จากบัญชีที่ใกล้เต็ม (เช่น >90%) ไปยังบัญชีที่ยังมีที่ว่างเหลือ
12. **Old & Unused Files Detector**: สแกนหาไฟล์ที่ไม่ได้เปิดอ่านหรือไม่มีการแก้ไขเป็นเวลานาน (เช่น เกิน 1–2 ปี)

---

## 💡 หมวดหมู่ที่ 3: โฟลเดอร์เสมือนและโครงสร้างไฟล์ (Virtual Hierarchy & Organization)
13. **Virtual Folders**: สร้างโฟลเดอร์จำลองใน DriveMerge เพื่อรวมไฟล์ที่เกี่ยวข้องกันจากคนละบัญชีมาไว้ในโฟลเดอร์เดียวกัน
14. **Folder Tree Navigation**: แถบ Sidebar แสดงโครงสร้างโฟลเดอร์แบบ Tree View ของแต่ละบัญชี
16. **Drag & Drop Organization**: ลากไฟล์ไปวางใส่โฟลเดอร์ หรือลากไฟล์ข้ามบัญชีในหน้า UI ได้ทันที

---

## 💡 หมวดหมู่ที่ 4: การดูตัวอย่างและความปลอดภัย (Preview & Security)
19. **Secure Token Storage**: เข้ารหัส Access Token และ Refresh Token ของบัญชี Google ด้วย AES-256 ในฐานข้อมูล

---

## 💡 หมวดหมู่ที่ 5: การทำงานอัตโนมัติและเบื้องหลัง (Automation & Background Jobs)
22. **Background File Migration Queue**: การย้ายไฟล์ขนาดใหญ่ทำผ่าน Background Job พร้อม Progress Bar แจ้งสถานะแบบเรียลไทม์
23. **Scheduled Auto-Backup**: ตั้งเวลาสำรองไฟล์สำคัญจากบัญชีหลักไปยังบัญชีสำรองอัตโนมัติ (เช่น ทุกสัปดาห์)

---

## 💡 หมวดหมู่ที่ 6: การปรับปรุง UI/UX (User Experience)
25. **Dark Mode / Light Mode Toggle**: ปุ่มสลับโหมดมืด-สว่างที่สมบูรณ์แบบตามสไตล์ Material Design 3
26. **Grid View / List View Toggle**: สลับมุมมองระหว่างการ์ดแบบตาราง (Grid) และรายการแถว (List Table) พร้อมแสดงขนาดไฟล์, วันที่แก้ไข, และบัญชี
27. **Advanced Search & Filter**: ค้นหาแบบละเอียดตามประเภทไฟล์ (รูปภาพ, เอกสาร, วิดีโอ, PDF), ขนาดไฟล์, และช่วงวันที่
28. **Multi-Language Support (TH/EN)**: สลับภาษาการใช้งานระหว่างภาษาไทยและภาษาอังกฤษ
29. **Storage Visualization Chart**: กราฟแสดงสัดส่วนการใช้พื้นที่ของแต่ละบัญชีแบบ Interactive (เช่น Donut Chart / Progress Bars)
