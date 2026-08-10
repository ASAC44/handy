import { describe, expect, test } from "bun:test";
import { ContextStore } from "../src/context";

describe("meeting context lifecycle", () => {
  test("previews, accepts, and removes a participant file", async () => {
    const store = new ContextStore();
    const form = new FormData();
    form.append("files", new File(["Never display customer_email."], "northstar.md", { type: "text/markdown" }));
    form.append("paths", "northstar.md");
    form.append("uploaderId", "maya");
    form.append("uploaderName", "Maya");
    form.append("role", "viewer");

    const pending = await store.upload(form);
    expect(pending.status).toBe("pending");
    expect(pending.preview).toContain("Never display customer_email");

    const accepted = await store.accept(pending.id);
    expect(accepted?.status).toBe("accepted");
    expect(store.acceptedText(pending.id)?.content).toContain("northstar.md");

    expect(await store.remove(pending.id)).toBe(true);
    expect(store.items()).toHaveLength(0);
    expect(store.acceptedText(pending.id)).toBeNull();
    await store.clear();
  });
});
