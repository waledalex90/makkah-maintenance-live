/** مطابقة تصنيف البلاغ (اسم الفئة) مع تخصص الملف الشخصي — يطابق منطق claim و RLS */
export function ticketCategoryNameMatchesSpecialty(categoryName: string | null | undefined, specialty: string | null): boolean {
  if (!specialty) return true;
  const n = (categoryName ?? "").toLowerCase();
  return (
    (specialty === "fire" && (n.includes("حريق") || n.includes("fire"))) ||
    (specialty === "electricity" && (n.includes("كهرباء") || n.includes("electric"))) ||
    (specialty === "ac" && (n.includes("تكييف") || n.includes("ac"))) ||
    (specialty === "civil" && (n.includes("مدني") || n.includes("مدنى") || n.includes("civil"))) ||
    (specialty === "kitchens" && (n.includes("مطابخ") || n.includes("kitchen")))
  );
}
