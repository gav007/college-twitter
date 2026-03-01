const textarea = document.querySelector('.tweet-textarea');
const counter = document.querySelector('.char-counter');
const csrfMeta = document.querySelector('meta[name="csrf-token"]');
const csrfToken = csrfMeta ? csrfMeta.getAttribute('content') : '';

if (textarea && counter) {
  const updateCounter = () => {
    const remaining = 280 - textarea.value.length;
    counter.textContent = remaining;
    counter.classList.toggle('danger', remaining < 20);
  };

  updateCounter();
  textarea.addEventListener('input', updateCounter);
}

document.querySelectorAll('.like-btn').forEach((btn) => {
  btn.addEventListener('click', async () => {
    const tweetId = btn.dataset.tweetId;

    try {
      const response = await fetch(`/tweets/${tweetId}/like`, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'x-csrf-token': csrfToken
        }
      });

      if (!response.ok) {
        return;
      }

      const payload = await response.json();
      btn.classList.toggle('liked', payload.liked);

      const likeCount = btn.querySelector('.like-count');
      if (likeCount) {
        likeCount.textContent = payload.like_count;
      }
    } catch (err) {
      console.error(err);
    }
  });
});
