export const toast = $state({ msg: "" });
let timer: ReturnType<typeof setTimeout> | undefined;

export function showToast(msg: string) {
  toast.msg = msg;
  clearTimeout(timer);
  timer = setTimeout(() => (toast.msg = ""), 2200);
}
