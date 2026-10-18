// One source of truth for words not yet submitted. Audio events never erase it.
export class VoiceDraft {
  text = "";
  needsReview = false;
  append(value: unknown) {
    const words = typeof value === "string" ? value.trim() : "";
    if (!words) return false;
    const joined = [this.text, words].filter(Boolean).join(" ");
    this.text = joined.slice(0, 2000);
    if (joined.length > 2000) this.hold();
    return true;
  }
  hold() { this.needsReview = true; }
  edit(value: string) { this.text = value.slice(0, 2000); this.hold(); }
  canAutoSend(pending: number, speaking: boolean) { return !!this.text.trim() && !this.needsReview && pending === 0 && !speaking; }
  clear() { this.text = ""; this.needsReview = false; }
}
