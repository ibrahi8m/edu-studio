/**
 * 1.1.0: the fixed project information shown on «عن المشروع». It is part of the project's
 * identity, so it is not editable in the settings and no other personal or academic data is shown.
 */
export const PROJECT_INFO = {
  owner: 'إبراهيم سمير الخطيب',
  ownerLabel: 'صاحب المشروع ومصممه',
  product: 'IBRAHI8M EDU STUDIO',
  rows: [
    ['البرنامج الأكاديمي', 'ماجستير المناهج وطرق التدريس'],
    ['المساق', 'تصميم المحتوى الرقمي'],
    ['الجامعة', 'الجامعة الإسلامية – كلية التربية'],
    ['أستاذ المساق', 'أ.د. مجدي عقل'],
  ] as [string, string][],
} as const;
