(() => {
  const shareButton =
    document.getElementById("shareButton");

  const copyButton =
    document.getElementById("copyButton");

  const copyMessageButton =
    document.getElementById("copyMessageButton");

  const shareStatus =
    document.getElementById("shareStatus");

  const shareMessage =
    document
      .getElementById("shareMessage")
      ?.textContent
      ?.trim() || "";

  const pageUrl = () =>
    window.location.href;


  function setStatus(message) {
    if (!shareStatus) return;

    shareStatus.textContent =
      message;

    window.clearTimeout(
      setStatus.timer
    );

    setStatus.timer =
      window.setTimeout(
        () => {
          shareStatus.textContent =
            "";
        },
        3000
      );
  }


  async function copyText(
    text,
    successMessage
  ) {
    try {
      await navigator.clipboard
        .writeText(text);

      setStatus(
        successMessage
      );

      return true;

    } catch (_) {
      const area =
        document.createElement(
          "textarea"
        );

      area.value =
        text;

      area.setAttribute(
        "readonly",
        ""
      );

      area.style.position =
        "fixed";

      area.style.opacity =
        "0";

      document.body
        .appendChild(area);

      area.select();

      const ok =
        document.execCommand(
          "copy"
        );

      area.remove();

      setStatus(
        ok
          ? successMessage
          : "コピーできませんでした"
      );

      return ok;
    }
  }


  shareButton
    ?.addEventListener(
      "click",
      async () => {
        const data = {
          title:
            "さかいそろばん教室｜お友達・ご兄弟姉妹のご紹介",

          text:
            shareMessage,

          url:
            pageUrl()
        };

        if (
          navigator.share
        ) {
          try {
            await navigator.share(
              data
            );

            return;

          } catch (error) {
            if (
              error?.name ===
              "AbortError"
            ) {
              return;
            }
          }
        }

        await copyText(
          `${shareMessage}\n${pageUrl()}`,
          "紹介文とページURLをコピーしました"
        );
      }
    );


  copyButton
    ?.addEventListener(
      "click",
      async () => {
        await copyText(
          pageUrl(),
          "ページURLをコピーしました"
        );
      }
    );


  copyMessageButton
    ?.addEventListener(
      "click",
      async () => {
        await copyText(
          shareMessage,
          "紹介文をコピーしました"
        );
      }
    );
})();
