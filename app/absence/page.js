export default function AbsencePage() {
  return (
    <main style={{ maxWidth: "600px", margin: "0 auto", padding: "20px" }}>
      <h1>振替・欠席連絡</h1>

      <form>
        <p>
          <label>生徒名</label><br />
          <input type="text" style={{ width: "100%", padding: "8px" }} />
        </p>

        <p>
          <label>教室</label><br />
          <select style={{ width: "100%", padding: "8px" }}>
            <option>穂波教室</option>
            <option>福沼教室</option>
          </select>
        </p>

        <p>
          <label>内容</label><br />
          <select style={{ width: "100%", padding: "8px" }}>
            <option>欠席</option>
            <option>振替希望</option>
          </select>
        </p>

        <p>
          <label>備考</label><br />
          <textarea rows="5" style={{ width: "100%", padding: "8px" }} />
        </p>

        <button
          type="submit"
          style={{
            width: "100%",
            padding: "12px",
            background: "#06C755",
            color: "#fff",
            border: "none",
            borderRadius: "8px"
          }}
        >
          送信
        </button>
      </form>
    </main>
  );
}
