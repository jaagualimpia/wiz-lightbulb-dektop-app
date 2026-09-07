const feedback = document.getElementById('feedback');
const feedbackIcon = document.getElementById('feedback-icon');
const feedbackTitle = document.getElementById('feedback-title');
const feedbackDetail = document.getElementById('feedback-detail');

window.feedbackApi.onUpdate(({ icon, title, detail = '', tone = 'neutral' }) => {
  feedback.className = `feedback ${tone}`;
  feedbackIcon.textContent = icon;
  feedbackTitle.textContent = title;
  feedbackDetail.textContent = detail;
});
