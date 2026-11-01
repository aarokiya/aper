/** Study focus mode (the hub's "Hide sidebar"): saved on this device. */
export const STUDY_FOCUS_KEY = 'aper-study-focus';

/** Set on <html> while focus mode is on and a /study page is open; globals.css hides the rail. */
export const STUDY_FOCUS_ATTR = 'data-study-focus';

export const isStudyPath = (pathname: string) =>
  pathname === '/study' || pathname.startsWith('/study/');

/** Runs before paint (with the theme boot script) so a reload in focus mode never flashes the rail. */
export const STUDY_FOCUS_BOOT_SCRIPT = `try{if(localStorage.getItem(${JSON.stringify(STUDY_FOCUS_KEY)})==='1'&&/^\\/study(\\/|$)/.test(location.pathname))document.documentElement.setAttribute(${JSON.stringify(STUDY_FOCUS_ATTR)},'')}catch(e){}`;
