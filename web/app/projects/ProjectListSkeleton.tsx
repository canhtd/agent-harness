export function ProjectListSkeleton() {
  return (
    <main className="page">
      <div className="project-filter-bar">
        <div className="skeleton-line" style={{ width: "120px", height: "32px" }} />
        <div className="skeleton-line" style={{ width: "120px", height: "32px" }} />
        <div className="skeleton-line" style={{ width: "120px", height: "32px" }} />
        <div className="skeleton-line" style={{ width: "120px", height: "32px" }} />
      </div>
      <div className="project-list">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="project-row project-row-skeleton">
            <div className="skeleton-line skeleton-short" />
            <div className="skeleton-line skeleton-long" />
            <div className="skeleton-line" style={{ width: "60px" }} />
            <div className="skeleton-line" style={{ width: "100px" }} />
          </div>
        ))}
      </div>
    </main>
  );
}
