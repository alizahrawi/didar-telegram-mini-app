import { z } from 'zod';

const optionalWebUrl = z.union([z.literal(''), z.string().url('لینک معتبر وارد کنید.').max(500)]).optional();

function restrictedUrl(hosts, label) {
  return optionalWebUrl.refine((value) => {
    if (!value) return true;
    try {
      const host = new URL(value).hostname.replace(/^www\./, '').toLowerCase();
      return hosts.some((allowed) => host === allowed || host.endsWith(`.${allowed}`));
    } catch {
      return false;
    }
  }, `لینک ${label} معتبر نیست.`);
}

export const profileSchema = z.object({
  displayName: z.string().trim().min(2, 'نام حداقل ۲ حرف باشد.').max(60),
  roleTitle: z.string().trim().max(80).optional().default(''),
  bio: z.string().trim().max(180).optional().default(''),
  avatarUrl: optionalWebUrl.default(''),
  instagramUrl: restrictedUrl(['instagram.com'], 'اینستاگرام').default(''),
  storyUrl: restrictedUrl(['instagram.com'], 'استوری').default(''),
  linkedinUrl: restrictedUrl(['linkedin.com', 'lnkd.in'], 'لینکدین').default(''),
});

export const roomSchema = z.object({
  title: z.string().trim().min(2).max(70),
  description: z.string().trim().max(180).optional().default(''),
});

export const messageSchema = z.object({
  body: z.string().trim().min(1).max(500),
});

export function validationError(error) {
  return error?.issues?.[0]?.message || 'اطلاعات واردشده معتبر نیست.';
}
