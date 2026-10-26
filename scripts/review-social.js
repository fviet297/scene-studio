// Scene Studio - upload copy for YouTube, TikTok and Facebook.
//
// Opened from the topbar "Bài đăng" button. "Viết bằng AI" posts to /api/social-generate, where
// the LLM writes a title, description and hashtags for all three platforms from the project's
// narration in one call. The tabs switch platform; every field stays editable, and each copy
// button copies what is in the field now, edits included. The result is kept per project in
// localStorage, so a reload or a reopened dialog never costs another call.
//
// Uses the panel globals ($, api, toast, lsGet, lsSet, state) from review-panel.js, which loads
// first.

const SOCIAL_STORE = "reviewSocialPosts:";
const SOCIAL_FIELDS = ["title", "description", "hashtags"];

const social = {
  platform: "youtube",
  posts: null, // { youtube|tiktok|facebook: { title, description, hashtags: string, titleLimit } }
  busy: false,
};

const socialSlug = () => state.project?.slug ?? "";
const socialInput = (field) =>
  $(`socialPost${field[0].toUpperCase()}${field.slice(1)}`);

// The server's hashtag array becomes one editable line, which is also what gets copied.
const toEditablePosts = (posts) =>
  Object.fromEntries(
    Object.entries(posts).map(([platform, post]) => [
      platform,
      { ...post, hashtags: post.hashtags.join(" ") },
    ]),
  );

function loadStoredPosts() {
  try {
    return JSON.parse(lsGet(SOCIAL_STORE + socialSlug()) ?? "null");
  } catch {
    return null;
  }
}

function saveStoredPosts() {
  lsSet(SOCIAL_STORE + socialSlug(), JSON.stringify(social.posts));
}

function renderTitleCount() {
  const post = social.posts?.[social.platform];
  if (!post) return;
  const length = $("socialPostTitle").value.length;
  $("socialTitleCount").textContent = `${length}/${post.titleLimit}`;
  $("socialTitleCount").classList.toggle("over", length > post.titleLimit);
}

function renderSocial() {
  for (const b of $("socialTabs").querySelectorAll("button"))
    b.setAttribute(
      "aria-pressed",
      String(b.dataset.platform === social.platform),
    );
  const post = social.posts?.[social.platform];
  $("socialPost").hidden = !post;
  $("socialEmpty").hidden = Boolean(post);
  $("socialCopyAll").disabled = !post;
  $("socialGenerate").textContent = social.posts
    ? "Viết lại bằng AI"
    : "Viết bằng AI";
  if (!post) return;
  for (const field of SOCIAL_FIELDS) socialInput(field).value = post[field];
  renderTitleCount();
}

function setSocialBusy(busy, status = "") {
  social.busy = busy;
  $("socialSpin").hidden = !busy;
  $("socialGenerate").disabled = busy;
  $("socialNote").disabled = busy;
  $("socialStatus").textContent = status;
  $("socialStatus").classList.remove("is-error");
}

function openSocialDialog() {
  if (!social.busy) {
    social.posts = loadStoredPosts();
    setSocialBusy(false);
  }
  renderSocial();
  $("socialOverlay").hidden = false;
  (social.posts ? $("socialPostTitle") : $("socialGenerate")).focus();
}

function closeSocialDialog() {
  $("socialOverlay").hidden = true;
}

async function generateSocialPosts() {
  const slug = socialSlug();
  setSocialBusy(true, "Đang viết cho YouTube, TikTok và Facebook…");
  try {
    const { posts } = await api("/api/social-generate", {
      note: $("socialNote").value,
    });
    // The project may have been switched while the LLM was writing; the result belongs to `slug`.
    lsSet(SOCIAL_STORE + slug, JSON.stringify(toEditablePosts(posts)));
    if (slug !== socialSlug()) {
      setSocialBusy(false);
      toast(`Bài đăng của "${slug}" đã xong — mở lại dự án đó để xem.`);
      return;
    }
    social.posts = toEditablePosts(posts);
    setSocialBusy(
      false,
      "Đã viết xong. Sửa trực tiếp trong ô nếu cần rồi copy.",
    );
    renderSocial();
  } catch (e) {
    setSocialBusy(false, e.message);
    $("socialStatus").classList.add("is-error");
  }
}

async function copySocialText(text, label) {
  try {
    await navigator.clipboard.writeText(text);
    toast(`Đã copy ${label}.`);
  } catch {
    toast("Clipboard không dùng được.", false);
  }
}

const SOCIAL_COPY_LABEL = {
  title: "tiêu đề",
  description: "mô tả",
  hashtags: "hashtag",
};

$("btnSocial").addEventListener("click", openSocialDialog);
$("socialClose").addEventListener("click", closeSocialDialog);
$("socialOverlay").addEventListener("click", (e) => {
  if (e.target === $("socialOverlay")) closeSocialDialog();
});
$("socialTabs").addEventListener("click", (e) => {
  const button = e.target.closest("button[data-platform]");
  if (!button) return;
  social.platform = button.dataset.platform;
  renderSocial();
});
$("socialGenerate").addEventListener("click", generateSocialPosts);
$("socialPost").addEventListener("input", (e) => {
  const field = SOCIAL_FIELDS.find((f) => socialInput(f) === e.target);
  if (!field) return;
  social.posts[social.platform][field] = e.target.value;
  saveStoredPosts();
  if (field === "title") renderTitleCount();
});
$("socialPost").addEventListener("click", (e) => {
  const button = e.target.closest("button[data-copy]");
  if (!button) return;
  const field = button.dataset.copy;
  copySocialText(socialInput(field).value, SOCIAL_COPY_LABEL[field]);
});
$("socialCopyAll").addEventListener("click", () => {
  const text = SOCIAL_FIELDS.map((f) => socialInput(f).value.trim())
    .filter(Boolean)
    .join("\n\n");
  copySocialText(text, "tiêu đề, mô tả và hashtag");
});
