/**
 * ĐÃ GỘP VÀO `SiteNav.tsx`.
 *
 * Ban đầu chỉ nút đổi ngôn ngữ là Client Component, còn hai link "Việc làm" /
 * "Công ty" nằm trong layout (Server Component). Cách đó để lại hai lỗi:
 *  • Layout không nhận `searchParams` nên hai link đó mãi là tiếng Việt.
 *  • Bấm vào chúng sẽ mất `?lang=en`, đẩy người dùng ngược về tiếng Việt.
 *
 * Giải pháp: đưa cả thanh nav vào một Client Component duy nhất. File này giữ
 * lại chỉ để ghi chú, không còn export gì.
 */
export {};
