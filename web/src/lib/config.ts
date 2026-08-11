const configuredPublicUrl = import.meta.env.VITE_PUBLIC_URL?.trim();

export const publicUrl = (configuredPublicUrl || window.location.origin).replace(/\/+$/, '');
