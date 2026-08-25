# KURABE QAQC — Dàn ý và hướng dẫn tạo PowerPoint giới thiệu web app

> Tài liệu này dùng làm brief cho ChatGPT khi tạo file PowerPoint trình bày với Ban giám đốc / quản lý người Nhật của Kurabe.
>
> Mục tiêu: trình bày rõ vấn đề của quy trình Excel cũ, giá trị của web app KURABE QAQC, vai trò của AI, hiệu quả vận hành và cách đo ROI mà không phóng đại số liệu.

---

## 1. Thông điệp trung tâm

### Câu chuyện một câu

> KURABE QAQC chuyển quy trình đánh giá từ nhiều file Excel rời rạc, khó kiểm soát thành một hệ thống tập trung, có quy trình tuần tự, dữ liệu thời gian thực, báo cáo tự động và AI hỗ trợ người dùng — giúp giảm công việc hành chính, giảm sai sót và ra quyết định nhanh hơn.

### Thông điệp cần người nghe nhớ sau buổi trình bày

1. **Excel không sai vì Excel yếu**, mà vì quy mô khoảng 200 người và nhiều vòng đánh giá khiến việc phân tán file, tổng hợp và kiểm soát trạng thái trở nên tốn thời gian.
2. Web app tạo ra **một nguồn dữ liệu thống nhất** cho nhân sự, nhóm, tiêu chuẩn, kỳ đánh giá, điểm số, nhận xét và kết quả.
3. Hệ thống **không thay thế người đánh giá**. Hệ thống kiểm soát quy trình, tính điểm theo cấu hình, cảnh báo bất thường và để quản lý đưa ra quyết định cuối cùng.
4. AI giúp giảm thời gian học và hỗ trợ thao tác: người dùng chỉ cần làm quen giao diện trong vài phút; khi không biết, có thể hỏi chatbot bằng ngôn ngữ tự nhiên.
5. Hiệu quả tài chính cần được chốt bằng một pilot đo thực tế tại Kurabe. Không trình bày số giờ tiết kiệm như một sự thật đã được đo nếu chưa có time-study.

---

## 2. Nguyên tắc về số liệu và mức độ chắc chắn

### 2.1. Số liệu / tính năng có thể trình bày là đã xác minh trong hệ thống

- Hệ thống có quản lý nhân viên, nhóm, Leader/SubLeader, tiêu chuẩn đánh giá, thang điểm, kỳ đánh giá và nhật ký hoạt động.
- Có workflow đánh giá theo vòng và theo vai trò:
  - Manager: tự đánh giá 1 vòng.
  - Leader: tự đánh giá + Manager đánh giá vòng sau.
  - SubLeader: nhiều vòng theo quy trình.
  - Nhân viên/Công nhân: quy trình nhiều vòng do cấp quản lý đánh giá.
- Vòng sau chỉ mở khi vòng trước đã nộp.
- Phiếu đã nộp bị khóa; muốn sửa phải được cấp trên trả lại kèm lý do.
- Có dashboard, báo cáo, phân bổ xếp loại, radar năng lực, so sánh nhóm, Top Performers và xuất Excel.
- Có thang xếp loại S/A/AB/B/C/D cấu hình được theo dữ liệu hệ thống.
- Có audit log cho các thao tác quan trọng.
- Có giao diện hướng dẫn theo vai trò và bản in A4.
- Có chatbot AI theo vai trò và trang đang mở.
- Có AI hỗ trợ nhận xét, soạn thông báo kết quả, tóm tắt kỳ và giải thích cảnh báo.
- Cảnh báo chênh lệch điểm được phát hiện bằng quy tắc xác định, không phải AI đoán tùy ý:
  - Chênh lệch từ 20 điểm: cảnh báo mức cần chú ý.
  - Chênh lệch từ 30 điểm: cảnh báo mức nghiêm trọng.
- Production canary gần nhất đã kiểm tra workflow SubLeader → Leader → Manager → Approved và kiểm tra rollback failure-path thành công trên dữ liệu test của hệ thống.

### 2.2. Những số liệu chưa được đo tại Kurabe

Các số liệu dưới đây phải ghi rõ là **mô hình minh họa / cần xác nhận bằng pilot**:

- Số giờ hiện đang dùng cho một kỳ đánh giá Excel.
- Số giờ thực tế sau khi dùng web app.
- Tỷ lệ giảm thời gian.
- Tỷ lệ giảm lỗi nhập liệu.
- Số ngày công tiết kiệm mỗi năm.
- Chi phí tiền quy đổi từ thời gian tiết kiệm.
- Khả năng vận hành ổn định ở đúng quy mô 200 người trong điều kiện thực tế của Kurabe.
- Backup định kỳ, quy trình phục hồi và BCP/khả năng sẵn sàng cho môi trường production — **cần xác nhận riêng trước rollout chính thức**.

Không dùng các câu như “tiết kiệm chính xác 75%” hoặc “giảm 90% lỗi” nếu chưa có bảng đo trước/sau.

### 2.3. Bộ số liệu ước lượng đề xuất cho bản trình bày

Để bài trình bày có con số cụ thể nhưng vẫn trung thực, dùng một mô hình minh họa duy nhất:

- Quy mô giả định: khoảng 200 người.
- Phần đang đo: **thời gian quản trị, tổng hợp, theo dõi và làm báo cáo**, không tính thời gian chuyên môn để người quản lý suy xét và chấm.
- Mốc Excel giả định: **120 giờ/kỳ**.
- Ba kịch bản tiết kiệm thời gian:
  - Thận trọng: 15% = 18 giờ/kỳ.
  - Cơ sở: 25% = 30 giờ/kỳ.
  - Lạc quan: **30% = 36 giờ/kỳ**.
- Giả định **1 kỳ/năm**: kịch bản lạc quan tiết kiệm 36 giờ/năm, tương đương 4,5 ngày công nếu 1 ngày công = 8 giờ.
- Giá trị tài chính chỉ là giá trị thời gian quy đổi: `giờ tiết kiệm × chi phí nhân sự quy đổi mỗi giờ`.
- Ví dụ minh họa ở kịch bản lạc quan:
  - Nếu chi phí nhân sự quy đổi là 100.000 đồng/giờ: khoảng 3,6 triệu đồng/năm.
  - Nếu chi phí nhân sự quy đổi là 150.000 đồng/giờ: khoảng 5,4 triệu đồng/năm.
- Đây **chưa phải ROI ròng**: chưa trừ chi phí triển khai, vận hành, đào tạo, thiết bị hoặc license nếu có.

Khi trình bày, ghi rõ: `試算例 — ước lượng trước pilot`. Sau pilot, thay toàn bộ bằng số đo thực tế của Kurabe.

---

## 3. Đối tượng, ngôn ngữ và phong cách PowerPoint

### Đối tượng

- Ban giám đốc Kurabe.
- Quản lý nhà máy / bộ phận QAQC.
- Người phụ trách nhân sự hoặc tổng hợp đánh giá.
- Người Nhật cần thấy rõ hiệu quả vận hành, tính kiểm soát và khả năng triển khai.

### Ngôn ngữ

- Nội dung chính trên slide: **tiếng Nhật business**, lịch sự, ngắn gọn.
- Có thể thêm tiếng Việt trong speaker notes để anh thuyết trình.
- Nếu cần bản song ngữ: tiếng Nhật là chính, tiếng Việt nhỏ hơn ở speaker notes hoặc appendix, không làm slide quá nhiều chữ.
- Dùng thống nhất các thuật ngữ:
  - Web app đánh giá: `人事評価・QAQC評価システム`
  - Kỳ đánh giá: `評価期間`
  - Tiêu chuẩn đánh giá: `評価基準`
  - Xếp loại: `評価ランク`
  - Dashboard: `ダッシュボード`
  - Nhật ký hoạt động: `操作ログ`
  - Trợ lý AI: `AIアシスタント`
  - Nhận xét AI: `AIコメント支援`
  - Cảnh báo bất thường: `評価差異アラート`
  - Một nguồn dữ liệu thống nhất: `一元管理`

### Phong cách hình ảnh

- Tông màu: navy / xanh đậm / trắng / xanh lá nhấn cho hiệu quả.
- Phong cách: công nghiệp Nhật Bản, chính xác, sạch, đáng tin cậy, không màu mè.
- Tỷ lệ: 16:9.
- Font đề xuất: Noto Sans JP hoặc Yu Gothic.
- Mỗi slide tối đa 1 thông điệp chính, 3–5 bullet ngắn.
- Không dùng emoji.
- Không dùng ảnh có chữ AI tự sinh nếu chữ dễ bị sai. Chữ, biểu đồ và số liệu phải được dựng trực tiếp trong PowerPoint.
- Không dùng ảnh nhà máy có logo Kurabe nếu chưa được cung cấp logo hoặc chưa được phép.

---

## 4. Cấu trúc PowerPoint executive — 10 slide chính

> **Định hướng bắt buộc:** đây là bài trình bày về nguyên lý vận hành và hiệu quả kinh doanh, không phải buổi demo chi tiết từng màn hình. Phần chính chỉ nói app ở mức đủ để chứng minh giải pháp; không đưa danh sách chức năng dài lên slide.

### 10 slide chính đề xuất

1. **Bối cảnh:** đánh giá khoảng 200 người bằng Excel tạo chi phí quản trị và rủi ro kiểm soát.
2. **Vấn đề cốt lõi:** dữ liệu phân tán, nhiều vòng, khó theo dõi, khó tổng hợp và khó truy vết.
3. **Năm nguyên lý của giải pháp:** một nguồn dữ liệu, chuẩn hóa quy trình, phân quyền rõ, nhìn thấy tiến độ, người chịu trách nhiệm cuối.
4. **Hiệu suất vận hành:** giảm thao tác lặp, giảm thời gian tìm/gộp/kiểm tra file, tập trung thời gian vào đánh giá và cải tiến.
5. **Hiệu quả chất lượng:** giảm nhầm người, nhầm vòng, sai trạng thái và bỏ sót điểm cần kiểm tra.
6. **AI tạo đòn bẩy:** chatbot giảm thời gian đào tạo; AI hỗ trợ nhận xét, cảnh báo và tóm tắt; người quản lý vẫn quyết định.
7. **Ước lượng thời gian:** mô hình 15% / 25% / 30%, trong đó 30% là kịch bản lạc quan trước pilot.
8. **Ước lượng tài chính:** giờ tiết kiệm × chi phí nhân sự quy đổi; phân biệt giá trị thời gian với ROI ròng.
9. **Điều kiện thành công và rủi ro:** dữ liệu, quyền hạn, backup/BCP, thiết bị hiện trường, đào tạo và pilot.
10. **Đề xuất:** pilot một kỳ, đo trước/sau, xác nhận ROI rồi mới mở rộng lên khoảng 200 người.

### Tỷ lệ nội dung khuyến nghị

- 20%: bối cảnh và vấn đề.
- 25%: nguyên lý giải pháp.
- 35%: hiệu suất, hiệu quả, thời gian và tài chính.
- 15%: AI và nguyên tắc human-in-the-loop.
- 5%: pilot / bước tiếp theo.

### Nguyên tắc hình ảnh

- Ưu tiên sơ đồ trước/sau, biểu đồ thời gian và mô hình tác động.
- Chỉ dùng tối đa 1–2 screenshot app ở dạng minh họa, không walkthrough.
- Không dùng slide riêng cho từng trang Dashboard, Reports, Teams, Employees hoặc từng nút chức năng.

## 4A. Nội dung app tham khảo — không đưa chi tiết lên slide chính

Các slide chi tiết bên dưới là kho nội dung để ChatGPT kiểm tra tính đúng của giải pháp hoặc đưa vào appendix khi cần. Mặc định **không trình bày toàn bộ**.

## Slide 1 — Tiêu đề

### Tiêu đề tiếng Nhật đề xuất

`KURABE QAQC`

`評価業務を、Excel管理から一元化・可視化・AI支援へ`

### Phụ đề

`人事評価・QAQC評価業務の効率化と品質向上に向けたWebアプリケーション`

### Nội dung nói

- Đây là hệ thống web app được xây dựng để chuẩn hóa và số hóa quy trình đánh giá.
- Trọng tâm không chỉ là thay Excel bằng một giao diện mới, mà là kiểm soát toàn bộ vòng đời của dữ liệu đánh giá.

### Hình ảnh

- Ảnh minh họa quản lý Nhật trong môi trường sản xuất sạch, đứng trước dashboard dữ liệu.
- Không dùng ảnh người thật của Kurabe nếu chưa có quyền.

---

## Slide 2 — Bối cảnh và vấn đề của quy trình Excel

### Tiêu đề tiếng Nhật

`約200名をExcelで評価する場合に発生する課題`

### Nội dung trên slide

- Nhiều file / nhiều phiên bản / khó xác định file mới nhất.
- Thu thập và nhắc người chưa hoàn thành bằng thủ công.
- Nhiều vòng đánh giá làm tăng nguy cơ nhầm người, nhầm vòng, nhầm điểm.
- Tổng hợp báo cáo mất nhiều thời gian.
- Khó theo dõi chênh lệch điểm và xu hướng giữa các nhóm.
- Khó truy lại ai đã sửa, sửa lúc nào và vì sao.

### Hình ảnh / sơ đồ

Bên trái: nhiều file Excel rời rạc, email, thư mục, giấy tờ.

Bên phải: người phụ trách đang cố tổng hợp nhiều bảng.

### Speaker note

Không nên nói Excel “không dùng được”. Nên nói: với quy mô khoảng 200 người và nhiều vòng đánh giá, Excel tạo ra chi phí quản trị lớn, đặc biệt ở khâu thu thập, kiểm tra, tổng hợp và theo dõi.

---

## Slide 3 — Chi phí vận hành của cách làm cũ

### Tiêu đề tiếng Nhật

`Excel運用で見えにくい管理コスト`

### Nội dung

Chia chi phí thành 6 nhóm:

1. Chuẩn bị danh sách, biểu mẫu và phân công.
2. Gửi, nhận và kiểm tra file.
3. Theo dõi người chưa nộp.
4. Gộp dữ liệu nhiều vòng.
5. Sửa lỗi / xử lý trùng phiên bản / xử lý thiếu dữ liệu.
6. Tạo báo cáo và giải thích kết quả.

### Thông điệp lớn

`評価そのものだけでなく、評価を管理するための時間が大きい。`

### Biểu đồ

Dùng biểu đồ thanh “thời gian quản trị” theo 6 nhóm. Không ghi số tuyệt đối nếu Kurabe chưa đo; dùng nhãn `現状測定が必要` hoặc dùng mô hình minh họa ở Slide 10.

---

## Slide 4 — Giải pháp tổng thể

### Tiêu đề tiếng Nhật

`KURABE QAQC：評価業務を一つの流れに統合`

### 5 khối chính

1. `人員・組織管理` — quản lý nhân viên, nhóm, vai trò.
2. `評価基準・評価期間` — quản lý tiêu chuẩn, mức điểm và kỳ đánh giá.
3. `段階的な評価ワークフロー` — workflow nhiều vòng, đúng người, đúng thời điểm.
4. `リアルタイム可視化` — dashboard, tiến độ và báo cáo.
5. `AIアシスタント` — hướng dẫn thao tác, nhận xét, cảnh báo và tóm tắt.

### Thông điệp

`Excelファイルを置き換えるだけではなく、評価プロセス全体を標準化する。`

---

## Slide 5 — Quy trình đánh giá nhiều vòng

### Tiêu đề tiếng Nhật

`役職に応じた評価フローと進捗管理`

### Sơ đồ đề xuất

```text
評価期間を開始
        ↓
対象者・評価基準を確定
        ↓
第1ラウンド：自己評価または担当管理者の評価
        ↓
第2ラウンド：Leader / 管理者による評価
        ↓
第3ラウンド：Managerによる最終評価
        ↓
結果確定・通知・レポート
```

### Các điểm nhấn cần nói

- Người dùng chỉ nhìn thấy những phiếu thuộc phạm vi quyền của mình.
- Vòng sau không mở sớm khi vòng trước chưa hoàn tất.
- Phiếu đã nộp được khóa để tránh sửa ngoài quy trình.
- Nếu cần chỉnh sửa, cấp trên trả lại kèm lý do; hệ thống mở đúng vòng cần sửa.
- Có trạng thái rõ ràng: chưa bắt đầu, đã nộp vòng nào, đã có kết quả cuối.

---

## Slide 6 — Web app nâng cấp quy trình ở những điểm nào?

### Tiêu đề tiếng Nhật

`Excel運用からWebアプリへ：改善される8つの領域`

| Trước đây | Sau khi dùng KURABE QAQC |
|---|---|
| File phân tán | Dữ liệu tập trung một nguồn |
| Khó biết bản mới nhất | Một trạng thái dữ liệu thống nhất |
| Nhắc thủ công | Dashboard hiển thị người / nhóm còn thiếu |
| Tự kiểm tra vòng đánh giá | Workflow khóa / mở theo quy tắc |
| Công thức dễ bị copy sai | Thang điểm và xếp loại cấu hình tập trung |
| Tổng hợp thủ công | Dashboard, báo cáo, phân bổ và so sánh |
| Khó truy vết | Nhật ký hoạt động |
| Người mới phải hỏi nhiều người | Chatbot AI hướng dẫn theo vai trò và trang |

### Thông điệp

Đây là nâng cấp về **khả năng kiểm soát**, không chỉ là nâng cấp về giao diện.

---

## Slide 7 — Giá trị cho từng nhóm người sử dụng

### Tiêu đề tiếng Nhật

`利用者ごとのメリット`

### Manager / Ban quản lý

- Nhìn toàn bộ tiến độ theo thời gian thực.
- Xem nhóm nào chậm, ai chưa hoàn thành, kết quả phân bổ ra sao.
- Có dữ liệu để trao đổi và ra quyết định nhanh hơn.
- Có nhật ký thao tác và quy trình trả lại rõ ràng.

### Leader / SubLeader

- Chỉ thấy dữ liệu thuộc phạm vi phụ trách.
- Biết chính xác ai đang giữ lượt đánh giá.
- Không phải tìm trong nhiều file.
- Có thể dùng AI để gợi ý nhận xét cụ thể theo tiêu chuẩn đã chấm.

### Nhân viên

- Xem kết quả của chính mình sau khi kỳ đánh giá được chốt.
- Nhận thông báo kết quả rõ ràng.
- Có thể hỏi hướng dẫn cơ bản bằng chatbot theo phạm vi được cấp.
- Giao diện responsive cho smartphone/tablet; điều kiện thiết bị và mạng tại hiện trường sẽ được xác nhận trong pilot.

### Bộ phận nhân sự / QAQC

- Giảm tổng hợp thủ công.
- Dễ kiểm tra dữ liệu thiếu / sai / bất thường.
- Có báo cáo và lịch sử để đối chiếu.

---

## Slide 8 — AI Chatbot: giảm thời gian đào tạo và hỗ trợ tại chỗ

### Tiêu đề tiếng Nhật

`AIアシスタント：教育時間を短縮し、現場の疑問をその場で解決`

### Thông điệp chính

> Người sử dụng không cần nhớ toàn bộ hướng dẫn ngay từ đầu. Chỉ cần làm quen giao diện trong vài phút; khi không biết thao tác, có thể hỏi chatbot bằng câu hỏi tự nhiên.

### Ví dụ câu hỏi tiếng Nhật để đặt trên slide

- `評価が進められない理由は何ですか？`
- `この画面で次に何をすればよいですか？`
- `第2ラウンドが開かないのはなぜですか？`
- `自分の担当範囲で未完了の評価を教えてください。`
- `この評価結果を簡単に説明してください。`

### Các điểm AI làm được

- Hiểu vai trò của người hỏi.
- Hiểu trang người dùng đang mở.
- Trả lời theo quyền của Manager / Leader / SubLeader / Nhân viên.
- Hướng dẫn cụ thể theo từng bước, không chỉ trả lời chung chung.
- Khi câu hỏi có dữ liệu, AI có thể dùng dữ liệu được phép xem để giải thích.
- Nếu không chắc, AI phải nói rõ chưa chắc thay vì bịa.

### Cách nói an toàn

Không nói “AI thay thế đào tạo hoàn toàn”. Nói:

`初期教育を軽くし、操作中の疑問をその場で解決することで、教育担当者への問い合わせを減らす。`

---

## Slide 9 — AI hỗ trợ đánh giá nhưng không thay thế người đánh giá

### Tiêu đề tiếng Nhật

`AIは判断を代替せず、評価品質を支援する`

### 4 lớp hỗ trợ

#### 1. Gợi ý nhận xét theo dữ liệu đã chấm

AI đọc chi tiết từng tiêu chuẩn, mức điểm, ghi chú và xếp loại để đề xuất nhận xét 4–5 câu cụ thể hơn, tránh nhận xét chung chung.

#### 2. Soạn thông báo kết quả

AI soạn thông báo riêng cho từng nhân viên, có thể dùng cho nhiều người theo từng đợt. Quản lý rà soát trước khi gửi.

#### 3. Kiểm tra chênh lệch điểm

Hệ thống phát hiện chênh lệch giữa các vòng bằng quy tắc xác định. AI chỉ giải thích các khả năng và đề xuất hướng kiểm tra.

#### 4. Tóm tắt kỳ và biên bản

AI hỗ trợ tổng hợp tình hình kỳ đánh giá, kết quả, vấn đề và khuyến nghị để quản lý rà soát.

### Guardrail bắt buộc trên slide

`最終評価は必ず人が確認・承認する。AIの出力は提案であり、確定結果ではない。`

### Câu giải thích “chống sai sót”

Không nói AI đảm bảo không có sai sót. Nói:

- Hệ thống giảm sai sót do nhầm vòng, nhầm người, sai trạng thái và tổng hợp thủ công.
- AI giúp phát hiện điểm cần xem lại và chuẩn hóa bản nháp nhận xét.
- Quyền quyết định cuối cùng vẫn thuộc người quản lý.

---

## Slide 10 — Hiệu quả thời gian: mô hình minh họa có kiểm soát

### Tiêu đề tiếng Nhật

`時間削減効果：まずは1サイクルで測定する`

### Lời dẫn bắt buộc

`以下はKurabeで実測した数値ではなく、効果測定のための試算例です。実運用前に1回の評価サイクルで測定します。`

### Công thức

```text
Thời gian tiết kiệm
= Thời gian quản trị bằng Excel
− Thời gian quản trị bằng web app

Tỷ lệ tiết kiệm
= Thời gian tiết kiệm / Thời gian Excel × 100
```

### Mô hình ước lượng đề xuất

Lấy mốc Excel giả định **120 giờ/kỳ** cho phần quản trị, tổng hợp, theo dõi và báo cáo. Không tính thời gian chuyên môn để quản lý suy xét và chấm điểm.

| Kịch bản | Excel giả định | Web app ước lượng | Tiết kiệm/kỳ | Tiết kiệm/năm (1 kỳ) |
|---|---:|---:|---:|---:|
| Thận trọng | 120 giờ | 102 giờ | 18 giờ, 15% | 18 giờ/năm = 2,25 ngày công |
| Cơ sở | 120 giờ | 90 giờ | 30 giờ, 25% | 30 giờ/năm = 3,75 ngày công |
| Lạc quan | 120 giờ | 84 giờ | **36 giờ, 30%** | **36 giờ/năm = 4,5 ngày công** |

Giả định Kurabe có **1 kỳ đánh giá mỗi năm** và 1 ngày công = 8 giờ. Đây là **ước lượng trước pilot**, không phải số liệu thực tế.

### Giá trị tài chính minh họa — chỉ tính giá trị thời gian

Công thức:

```text
Giá trị thời gian tiết kiệm/năm
= Giờ tiết kiệm trong 1 kỳ/năm × Chi phí nhân sự quy đổi/giờ
```

Ở kịch bản lạc quan, tiết kiệm 36 giờ/năm:

- Với 100.000 đồng/giờ: khoảng **3,6 triệu đồng/năm**.
- Với 150.000 đồng/giờ: khoảng **5,4 triệu đồng/năm**.

Đây là **giá trị thời gian quy đổi**, chưa phải ROI ròng. ROI ròng cần trừ chi phí triển khai, vận hành, đào tạo, thiết bị và license nếu có.

### Cách trình bày đúng

- Đặt nhãn lớn `試算例` hoặc `実測前の試算` trên biểu đồ.
- Dùng 30% làm kịch bản lạc quan, không trình bày như kết quả đã đạt.
- Speaker note phải nói rõ: “Sau một kỳ pilot, thay số ước lượng bằng số đo thực tế.”
- Không đặt dấu `実績` cho bất kỳ số nào trong bảng này.

---

## Slide 11 — Hiệu quả không chỉ nằm ở số giờ

### Tiêu đề tiếng Nhật

`効果は時間だけではない`

### 5 nhóm hiệu quả

1. **Tốc độ**: giảm thời gian tìm file, gộp file và làm báo cáo.
2. **Chất lượng dữ liệu**: giảm nhầm người, nhầm vòng, thiếu trạng thái và sai công thức.
3. **Minh bạch**: biết ai đang phụ trách, ai đã nộp, ai cần xử lý tiếp.
4. **Khả năng quản trị**: nhìn theo nhóm, vai trò, kỳ, xếp loại và bất thường.
5. **Khả năng mở rộng**: quy trình chuẩn có thể áp dụng cho số người lớn hơn mà không tăng file theo cấp số nhân.

### Chỉ số nên đo trong pilot

- Thời gian từ lúc mở kỳ đến khi hoàn tất.
- Thời gian tạo báo cáo cuối kỳ.
- Số lần phải hỏi lại người dùng về thao tác.
- Số lỗi cần sửa do nhầm file / nhầm vòng / nhầm người.
- Số người chưa hoàn thành tại từng thời điểm.
- Số giờ của bộ phận HR/QAQC dành cho tổng hợp.
- Mức độ hài lòng của người đánh giá.

---

## Slide 12 — Báo cáo và khả năng ra quyết định

### Tiêu đề tiếng Nhật

`リアルタイムな可視化で、対応を早める`

### Nội dung

- Dashboard tiến độ theo nhóm.
- Phân bổ xếp loại.
- Đánh giá tồn đọng theo người phụ trách.
- So sánh nhóm và điểm trung bình.
- Radar năng lực / khoảng cách so với mục tiêu.
- Top Performers.
- Hoạt động gần đây.
- Xuất báo cáo Excel khi cần chia sẻ hoặc lưu hồ sơ.

### Câu nhấn mạnh

`「誰がまだ完了していないか」だけでなく、「どこに対応すべきか」まで把握できる。`

### Hình ảnh

Dùng screenshot thật của Dashboard / Reports đã che hoặc thay toàn bộ tên, mã nhân viên và dữ liệu nhạy cảm bằng dữ liệu demo.

---

## Slide 13 — Bảo mật, quyền hạn và độ tin cậy

### Tiêu đề tiếng Nhật

`業務利用に必要な権限・監査・データ保護`

### Nội dung

- Phân quyền theo vai trò và phạm vi phụ trách.
- Nhân viên không xem được dữ liệu người khác ngoài phạm vi cho phép.
- Các thao tác quan trọng có nhật ký.
- Workflow khóa / mở theo điều kiện, tránh sửa sai vòng.
- Dữ liệu đánh giá và dữ liệu nhân sự được quản lý tập trung.
- AI không tự động chốt kết quả; người quản lý rà soát và phê duyệt.
- Có cơ chế trả lại đánh giá kèm lý do.
- **Trước rollout production cần chốt riêng**: backup định kỳ, quy trình phục hồi, kiểm tra khôi phục và phương án BCP/khả năng sẵn sàng.

### Lưu ý trình bày

Không đưa API key, tên thật, mã nhân viên thật, URL quản trị hoặc ảnh chứa dữ liệu riêng tư lên slide.

---

## Slide 14 — Đề xuất bước tiếp theo

### Tiêu đề tiếng Nhật

`次のステップ：小さく試し、実測してから拡張する`

### Lộ trình đề xuất

#### Giai đoạn 1 — Pilot

- Chọn 1 bộ phận hoặc 30–50 người đại diện.
- Chạy trọn 1 kỳ đánh giá.
- Đo thời gian Excel cũ và thời gian trên web app.
- Thu thập lỗi, câu hỏi và phản hồi người dùng.

#### Giai đoạn 2 — Chuẩn hóa

- Chốt tiêu chuẩn, thang điểm và quyền hạn.
- Chốt quy trình trả lại / phê duyệt.
- Hoàn thiện hướng dẫn tiếng Nhật.
- Đào tạo nhóm quản trị.

#### Giai đoạn 3 — Mở rộng

- Mở rộng lên khoảng 200 người.
- Theo dõi KPI theo kỳ.
- Đánh giá ROI hàng quý hoặc sau mỗi kỳ.

### Câu kết tiếng Nhật

`まずは1つの評価サイクルで効果を実測し、確認できた効果をKurabe全体へ段階的に展開する。`

---

## 5. Bảng so sánh chi tiết để ChatGPT dùng trong slide hoặc speaker notes

| Chủ đề | Excel nhiều file | KURABE QAQC | Giá trị kinh doanh |
|---|---|---|---|
| Lưu trữ | Phân tán theo người / nhóm / phiên bản | Một nguồn dữ liệu tập trung | Giảm tìm kiếm và nhầm phiên bản |
| Phân công | Gửi file và nhắc thủ công | Phân quyền và workflow | Rõ trách nhiệm |
| Trạng thái | Tự cập nhật / tự kiểm tra | Trạng thái theo vòng | Biết ngay điểm nghẽn |
| Công thức | Có thể copy sai giữa file | Thang điểm cấu hình | Nhất quán hơn |
| Nhiều vòng | Dễ nhầm vòng / nhầm người | Khóa / mở theo điều kiện | Giảm sai quy trình |
| Báo cáo | Gộp thủ công | Dashboard và báo cáo | Ra quyết định nhanh hơn |
| Bất thường | Khó phát hiện bằng mắt | Quy tắc cảnh báo + AI giải thích | Tập trung kiểm tra đúng nơi |
| Nhận xét | Viết lại thủ công | AI gợi ý theo dữ liệu | Giảm thời gian soạn nháp |
| Hướng dẫn | Hỏi người có kinh nghiệm | Chatbot AI tại chỗ | Giảm phụ thuộc đào tạo trực tiếp |
| Truy vết | Khó biết ai sửa | Nhật ký hoạt động | Tăng minh bạch |
| Mở rộng | Tăng số file và công việc tổng hợp | Dùng chung quy trình | Dễ nhân rộng hơn |

---

## 6. Cách nói chi tiết về thời gian tiết kiệm

### Không nên nói

- “Hệ thống chắc chắn tiết kiệm 75%.”
- “AI loại bỏ hoàn toàn đào tạo.”
- “AI tự chấm điểm chính xác 100%.”
- “Không bao giờ có sai sót.”
- “200 người đã được kiểm chứng production” nếu chưa có pilot đúng 200 người.

### Nên nói

- “Hệ thống có tiềm năng giảm mạnh phần thời gian quản trị, tổng hợp và theo dõi; tỷ lệ thực tế sẽ được đo qua một kỳ pilot.”
- “Thời gian chấm và suy xét của người quản lý vẫn là thời gian nghiệp vụ cần thiết; web app chủ yếu giảm thời gian hành chính và giảm thao tác lặp.”
- “Chatbot giúp giảm thời gian đào tạo ban đầu và giảm số câu hỏi lặp lại trong quá trình sử dụng.”
- “AI tạo bản nháp và cảnh báo để người quản lý kiểm tra nhanh hơn; không tự thay thế quyết định đánh giá.”
- “Mục tiêu của pilot là đo được số giờ tiết kiệm, số lỗi tránh được và mức độ chấp nhận của người dùng.”

### Mẫu câu để thay số liệu sau pilot

```text
Trước pilot: [___] giờ/kỳ cho quản trị Excel
Sau pilot: [___] giờ/kỳ cho quản trị trên KURABE QAQC
Tiết kiệm: [___] giờ/kỳ = [___]%
Số kỳ/năm: [___]
Tiết kiệm năm: [___] giờ = [___] ngày công
```

---

## 7. Prompt tạo ảnh minh họa cho ChatGPT

> Dùng các prompt dưới đây để tạo ảnh nền / ảnh minh họa. Không yêu cầu AI tạo chữ trong ảnh; chữ và biểu đồ sẽ dựng bằng PowerPoint.

### Prompt 1 — Excel cũ và sự phân tán

```text
Create a premium corporate editorial illustration for a Japanese manufacturing company presentation. Show the problem of managing performance evaluations for around 200 employees with many disconnected spreadsheet files, folders, email attachments, printed forms, and a stressed administrator trying to consolidate them. Clean Japanese factory-office atmosphere, navy blue and gray palette, realistic but polished, no logos, no readable text, no numbers, no watermark, 16:9 widescreen composition, leave empty space on the right for presentation text.
```

### Prompt 2 — Một nguồn dữ liệu tập trung

```text
Create a premium business technology illustration showing a Japanese QAQC manager moving from scattered spreadsheets into one centralized web application dashboard. Left side has fragmented files fading away; right side has a clean unified digital dashboard with abstract charts and workflow cards. Japanese manufacturing office, trustworthy, precise, calm, navy and green accents, no readable text, no logos, no watermark, 16:9 widescreen composition.
```

### Prompt 3 — Workflow nhiều vòng

```text
Create a clean isometric business process illustration for a Japanese performance evaluation workflow. Show three connected stages with human managers reviewing information in sequence: first evaluation, second review, final approval. Use subtle arrows and locked/unlocked workflow symbolism, professional Japanese manufacturing style, navy blue, white and green, no readable text, no logos, no watermark, 16:9 widescreen.
```

### Prompt 4 — Chatbot AI hướng dẫn tại chỗ

```text
Create a premium realistic illustration of a Japanese factory supervisor using a web application while an AI assistant appears as a calm chat panel beside the dashboard. The visual should communicate that the user can ask questions naturally and receive step-by-step guidance. Trustworthy enterprise AI, human-in-the-loop, no futuristic robot, no exaggerated holograms, no readable text, no logos, no watermark, 16:9 widescreen.
```

### Prompt 5 — AI hỗ trợ nhận xét, không thay thế con người

```text
Create a professional human-in-the-loop AI illustration for an enterprise evaluation system. A manager reviews an AI-generated draft comment and a data-based alert, with the final approval clearly remaining with the manager. Emphasize review, verification, and accountability. Japanese corporate style, clean desk, subtle dashboard elements, navy and green palette, no readable text, no logos, no watermark, 16:9 widescreen.
```

### Prompt 6 — Phát hiện bất thường

```text
Create a clean data analytics illustration showing two evaluation rounds with a visible score gap highlighted for review, not as an automatic judgment. A Japanese QAQC manager investigates the alert using a dashboard. Professional, precise, restrained, no dramatic warning icons, no readable text, no numbers, no logos, no watermark, 16:9 widescreen.
```

### Prompt 7 — Tiết kiệm thời gian và ra quyết định

```text
Create a premium corporate illustration showing time saved through a centralized performance evaluation workflow: a calm manager moves from repetitive paperwork toward a clear dashboard and faster decision-making. Use abstract clock and workflow motifs, Japanese manufacturing office, navy blue, white and green accents, realistic editorial style, no readable text, no logos, no watermark, 16:9 widescreen.
```

### Prompt 8 — Tầm nhìn triển khai tại Kurabe

```text
Create a polished closing illustration for a Japanese manufacturing company presentation: a team of managers and QAQC staff collaborating around a trusted performance evaluation dashboard, with a clean factory environment in the background. Communicate standardization, transparency, continuous improvement, and gradual rollout. Warm but professional, navy and green palette, no readable text, no logos, no watermark, 16:9 widescreen.
```

---

## 8. Prompt tổng để giao cho ChatGPT tạo PowerPoint

Sao chép toàn bộ prompt dưới đây vào ChatGPT cùng file brief này và các screenshot thật đã được chuẩn bị.

```text
Bạn là chuyên gia tư vấn chuyển đổi số và thiết kế PowerPoint B2B cho một công ty sản xuất Nhật Bản.

Hãy tạo một file PowerPoint 16:9, phong cách business Nhật Bản, để trình bày với công ty Kurabe về web app KURABE QAQC.

Mục tiêu của bài trình bày:
1. Giải thích vì sao đánh giá khoảng 200 người bằng nhiều file Excel gây ra chi phí quản trị lớn.
2. Cho thấy web app giúp tập trung dữ liệu, chuẩn hóa workflow, theo dõi tiến độ, giảm tổng hợp thủ công và tăng minh bạch.
3. Nhấn mạnh AI chatbot: người dùng chỉ cần vài phút làm quen giao diện; khi không biết có thể hỏi chatbot bằng ngôn ngữ tự nhiên; chatbot trả lời theo vai trò và trang đang mở, hướng dẫn cụ thể từng bước.
4. Giải thích AI hỗ trợ nhận xét, soạn thông báo, tóm tắt kỳ và giải thích cảnh báo bất thường.
5. Làm rõ AI không tự thay thế người đánh giá và không tự chốt kết quả. Điểm số vẫn do người đánh giá xác nhận; AI là công cụ hỗ trợ và bản nháp.
6. Trình bày mô hình đo hiệu quả thời gian, nhưng không biến số liệu minh họa thành số liệu thực tế.
7. Đề xuất pilot 1 kỳ đánh giá trước khi mở rộng lên khoảng 200 người.

Ngôn ngữ:
- Text trên slide bằng tiếng Nhật business, lịch sự, tự nhiên.
- Speaker notes có thể viết bằng tiếng Việt để người trình bày dễ sử dụng.
- Không dùng emoji.
- Thuật ngữ phải thống nhất: 人事評価・QAQC評価システム, 評価期間, 評価基準, ダッシュボード, AIアシスタント, 操作ログ.

Cấu trúc **10 slide executive**, không phải product demo:
1. Bối cảnh và chi phí quản trị của Excel ở quy mô khoảng 200 người.
2. Các vấn đề cốt lõi: phân tán, nhiều vòng, khó theo dõi, khó tổng hợp, khó truy vết.
3. Năm nguyên lý của giải pháp: một nguồn dữ liệu, chuẩn hóa, phân quyền, minh bạch, trách nhiệm con người.
4. Hiệu suất vận hành: thời gian và thao tác lặp được giảm ở đâu.
5. Hiệu quả chất lượng: giảm rủi ro và tăng khả năng kiểm soát như thế nào.
6. AI tạo đòn bẩy: chatbot, nhận xét, cảnh báo, tóm tắt; human-in-the-loop.
7. Mô hình tiết kiệm thời gian 15% / 25% / 30%, 30% là kịch bản lạc quan trước pilot.
8. Mô hình giá trị tài chính: giờ tiết kiệm × chi phí nhân sự quy đổi; phân biệt giá trị thời gian và ROI ròng.
9. Điều kiện thành công: dữ liệu, quyền, backup/BCP, thiết bị hiện trường, đào tạo và pilot.
10. Đề xuất pilot một kỳ trong một năm, đo trước/sau, rồi mới mở rộng lên khoảng 200 người.

Không tạo walkthrough chi tiết từng trang app. Tối đa 1–2 screenshot chỉ để minh họa rằng giải pháp tồn tại; không trình bày danh sách tính năng dài. Nếu cần, đưa chi tiết tính năng vào appendix.

Thiết kế:
- Navy, white, gray, green accent.
- Japanese manufacturing / QAQC / precision / reliability.
- Nhiều khoảng trắng, ít chữ, mỗi slide một thông điệp.
- Dùng biểu đồ PowerPoint thật cho dữ liệu; không dùng ảnh AI có chữ giả.
- Chỉ dùng tối đa 1–2 screenshot thật ở dạng minh họa cho giải pháp; không dùng screenshot để walkthrough từng trang. Che tên thật, mã nhân viên, URL riêng tư và dữ liệu nhạy cảm.
- Nếu chưa có screenshot, dùng mockup abstract không được mô tả là màn hình thật.

Quy tắc số liệu:
- Các số giờ và tỷ lệ tiết kiệm trong brief là mô hình minh họa, không phải số liệu Kurabe đã đo.
- Gắn nhãn tiếng Nhật `試算例` hoặc `実測前の試算` trên slide có số liệu minh họa.
- Không viết “75% tiết kiệm thực tế” hoặc “AI chính xác 100%”.
- Thêm speaker note: cần đo pilot trước khi chốt ROI.
- Không tuyên bố web app đã được kiểm chứng production ở đúng quy mô 200 người nếu không có bằng chứng.

Về AI:
- Chatbot hiểu vai trò và trang đang mở.
- Chatbot hướng dẫn thao tác cụ thể.
- AI có thể gợi ý nhận xét dựa trên chi tiết tiêu chuẩn và điểm đã chấm.
- AI có thể soạn thông báo kết quả theo từng nhân viên.
- Hệ thống phát hiện chênh lệch điểm bằng quy tắc xác định; AI hỗ trợ giải thích và đề xuất kiểm tra.
- AI hỗ trợ tóm tắt kỳ và biên bản.
- Mọi output AI phải được quản lý rà soát trước khi lưu hoặc gửi.

Đầu ra cần có:
1. File .pptx hoàn chỉnh.
2. Speaker notes cho từng slide.
3. Danh sách nguồn hình ảnh / screenshot được dùng.
4. Một slide appendix ghi rõ các số liệu nào là `実測値`, số liệu nào là `試算例`, số liệu nào cần đo trong pilot.
5. Checklist tự kiểm tra trước khi trình bày: không lỗi tiếng Nhật, không số liệu bịa, không lộ PII, không claim AI thay người, không claim ROI đã đo nếu chưa đo.
```

---

## 9. Checklist chuẩn bị trước khi giao file cho ChatGPT

### Nội dung

- [ ] Đã xác định người nghe chính.
- [ ] Đã chọn thông điệp: giảm chi phí quản trị, tăng kiểm soát, AI hỗ trợ.
- [ ] Đã quyết định bản tiếng Nhật hoặc song ngữ.
- [ ] Đã xác nhận tên chính thức của hệ thống khi trình bày.
- [ ] Đã xác nhận số người “khoảng 200” là quy mô mục tiêu / quy mô vận hành thực tế.

### Dữ liệu

- [ ] Có time-study Excel hiện tại của ít nhất một kỳ gần nhất.
- [ ] Có số giờ HR/QAQC đang dùng để tổng hợp.
- [ ] Có số người tham gia và số vòng đánh giá thực tế.
- [ ] Có số lỗi / số lần phải sửa / số lần nhắc lại nếu muốn đưa KPI.
- [ ] Tách rõ `実測値` và `試算例`.

### Hình ảnh

- [ ] Screenshot Dashboard đã che PII.
- [ ] Screenshot Reports đã che PII.
- [ ] Screenshot phiếu đánh giá đã che PII.
- [ ] Screenshot chatbot hoặc mockup được ghi rõ là ảnh thật / mockup.
- [ ] Không dùng ảnh có logo Kurabe nếu chưa được phép.

### Chất lượng PowerPoint

- [ ] Tiếng Nhật được người Nhật kiểm tra.
- [ ] Không có emoji hoặc câu văn quá quảng cáo.
- [ ] Mỗi slide chỉ có một thông điệp chính.
- [ ] Có speaker notes.
- [ ] Có appendix về phương pháp đo ROI.
- [ ] Không đưa credential, API key, URL quản trị hoặc dữ liệu nhân sự thật.

---

## 10. Kết luận dành cho người trình bày

Cách trình bày thuyết phục nhất không phải là hứa một con số tiết kiệm thật lớn. Cách tốt hơn là:

1. Cho thấy vấn đề Excel ở quy mô 200 người là vấn đề vận hành có thật.
2. Chỉ ra web app giải quyết từng điểm nghẽn bằng workflow và dữ liệu tập trung.
3. Nhấn mạnh chatbot AI giúp người dùng tự học và tự giải quyết câu hỏi trong lúc làm việc.
4. Giải thích AI hỗ trợ chất lượng nhưng vẫn giữ trách nhiệm quyết định ở con người.
5. Đề xuất pilot 1 kỳ, đo trước/sau, rồi mới chốt con số tiết kiệm và mở rộng toàn Kurabe.

> Thông điệp kết thúc đề xuất:
>
> `KURABE QAQC không chỉ số hóa biểu mẫu đánh giá. Hệ thống số hóa toàn bộ cách tổ chức, thực hiện, kiểm tra và cải tiến quy trình đánh giá.`
