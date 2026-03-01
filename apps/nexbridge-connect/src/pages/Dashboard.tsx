import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { listAssessments, type VideoAssessmentRecord } from "../lib/api";

export default function Dashboard() {
  const navigate = useNavigate();
  const [assessments, setAssessments] = useState<VideoAssessmentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listAssessments()
      .then(setAssessments)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="mx-auto max-w-4xl p-6">
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-800">
          Video Assessments
        </h2>
        <button
          onClick={() => navigate("/assess")}
          className="rounded bg-nexus-600 px-4 py-2 text-sm font-medium text-white hover:bg-nexus-700"
        >
          + New Assessment
        </button>
      </div>

      {loading && <p className="text-sm text-gray-500">Loading…</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}

      {!loading && assessments.length === 0 && (
        <div className="rounded-lg border-2 border-dashed border-gray-200 p-12 text-center">
          <p className="text-gray-500">No assessments yet.</p>
          <p className="mt-1 text-sm text-gray-400">
            Click "New Assessment" to analyze a property video.
          </p>
        </div>
      )}

      {assessments.length > 0 && (
        <div className="space-y-3">
          {assessments.map((a) => (
            <div
              key={a.id}
              className="flex items-center justify-between rounded-lg border bg-white px-5 py-4 shadow-sm"
            >
              <div>
                <p className="font-medium text-gray-800">{a.videoFileName}</p>
                <p className="mt-0.5 text-xs text-gray-500">
                  {a.sourceType} · {a.findingsCount} findings ·{" "}
                  {new Date(a.createdAt).toLocaleDateString()}
                </p>
              </div>
              <span
                className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                  a.status === "COMPLETED"
                    ? "bg-green-100 text-green-700"
                    : a.status === "PROCESSING"
                      ? "bg-yellow-100 text-yellow-700"
                      : "bg-gray-100 text-gray-700"
                }`}
              >
                {a.status}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
