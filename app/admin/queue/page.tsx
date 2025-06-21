// app/admin/queue/page.tsx
import Link from "next/link";
import { query } from "@lib/db";

type QueueJob = {
  id: string;
  name: string;
  priority: number;
  data: any;
  state: string;
  retry_count: number;
  retry_limit: number;
  created_on: string;
  started_on: string | null;
  completed_on: string | null;
  output: any;
};

type QueueStats = {
  state: string;
  count: number;
};

export default async function QueuePage() {
  // Get queue statistics by state
  const stats = await query<QueueStats>(
    `SELECT state, COUNT(*) as count 
     FROM pgboss.job 
     GROUP BY state 
     ORDER BY state`
  );

  // Get active jobs (created, active, retry)
  const activeJobs = await query<QueueJob>(
    `SELECT id, name, priority, data, state, retry_count, retry_limit, 
            created_on, started_on, completed_on, output
     FROM pgboss.job 
     WHERE state IN ('created', 'active', 'retry')
     ORDER BY created_on DESC
     LIMIT 20`
  );

  // Get 10 most recent completions
  const recentCompletions = await query<QueueJob>(
    `SELECT id, name, priority, data, state, retry_count, retry_limit, 
            created_on, started_on, completed_on, output
     FROM pgboss.job 
     WHERE state = 'completed' AND completed_on IS NOT NULL
     ORDER BY completed_on DESC
     LIMIT 10`
  );

  // Get 10 most recent creations
  const recentCreated = await query<QueueJob>(
    `SELECT id, name, priority, data, state, retry_count, retry_limit, 
            created_on, started_on, completed_on, output
     FROM pgboss.job 
     ORDER BY created_on DESC
     LIMIT 10`
  );

  // Get 10 most recent errors
  const recentErrors = await query<QueueJob>(
    `SELECT id, name, priority, data, state, retry_count, retry_limit, 
            created_on, started_on, completed_on, output
     FROM pgboss.job 
     WHERE state IN ('failed', 'cancelled')
     ORDER BY completed_on DESC NULLS LAST, created_on DESC
     LIMIT 10`
  );

  return (
    <div className="container mx-auto p-6">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-4xl font-extrabold">Queue Statistics</h1>
        <Link href="/admin" className="btn btn-secondary">
          Back to Admin
        </Link>
      </div>

      {/* Queue Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 mb-8">
        {stats.map((stat) => (
          <div key={stat.state} className="card bg-base-100 shadow p-4 text-center">
            <div className="stat-value text-2xl font-bold">{stat.count}</div>
            <div className="stat-title capitalize">{stat.state}</div>
          </div>
        ))}
      </div>

      {/* Active Jobs */}
      <div className="mb-8">
        <h2 className="text-2xl font-bold mb-4">Active Jobs ({activeJobs.length})</h2>
        {activeJobs.length === 0 ? (
          <div className="text-center text-gray-500 py-8">No active jobs</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="table table-zebra w-full">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Name</th>
                  <th>State</th>
                  <th>Priority</th>
                  <th>Retry</th>
                  <th>Created</th>
                  <th>Started</th>
                  <th>Data</th>
                </tr>
              </thead>
              <tbody>
                {activeJobs.map((job) => (
                  <tr key={job.id}>
                    <td className="font-mono text-xs">{job.id.substring(0, 8)}...</td>
                    <td className="font-semibold">{job.name}</td>
                    <td>
                      <span className={`badge ${
                        job.state === 'active' ? 'badge-success' :
                        job.state === 'retry' ? 'badge-warning' : 'badge-info'
                      }`}>
                        {job.state}
                      </span>
                    </td>
                    <td>{job.priority}</td>
                    <td>{job.retry_count}/{job.retry_limit}</td>
                    <td className="text-sm">{new Date(job.created_on).toLocaleString()}</td>
                    <td className="text-sm">
                      {job.started_on ? new Date(job.started_on).toLocaleString() : '-'}
                    </td>
                    <td className="text-xs max-w-xs">
                      {job.data?.emailId ? (
                        <Link href={`/admin/${job.data.emailId}`} className="link link-primary">
                          {job.data.emailId.substring(0, 8)}...
                        </Link>
                      ) : (
                        <span className="truncate">{JSON.stringify(job.data)}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Recent Completions */}
      <div className="mb-8">
        <h2 className="text-2xl font-bold mb-4">Recent Completions</h2>
        {recentCompletions.length === 0 ? (
          <div className="text-center text-gray-500 py-8">No recent completions</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="table table-zebra w-full">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Name</th>
                  <th>State</th>
                  <th>Priority</th>
                  <th>Created</th>
                  <th>Completed</th>
                  <th>Data</th>
                </tr>
              </thead>
              <tbody>
                {recentCompletions.map((job) => (
                  <tr key={job.id}>
                    <td className="font-mono text-xs">{job.id.substring(0, 8)}...</td>
                    <td className="font-semibold">{job.name}</td>
                    <td>
                      <span className="badge badge-success">completed</span>
                    </td>
                    <td>{job.priority}</td>
                    <td className="text-sm">{new Date(job.created_on).toLocaleString()}</td>
                    <td className="text-sm">
                      {job.completed_on ? new Date(job.completed_on).toLocaleString() : '-'}
                    </td>
                    <td className="text-xs max-w-xs">
                      {job.data?.emailId ? (
                        <Link href={`/admin/${job.data.emailId}`} className="link link-primary">
                          {job.data.emailId.substring(0, 8)}...
                        </Link>
                      ) : (
                        <span className="truncate">{JSON.stringify(job.data)}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Recently Created */}
      <div className="mb-8">
        <h2 className="text-2xl font-bold mb-4">Recently Created</h2>
        {recentCreated.length === 0 ? (
          <div className="text-center text-gray-500 py-8">No recent jobs</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="table table-zebra w-full">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Name</th>
                  <th>State</th>
                  <th>Priority</th>
                  <th>Retry</th>
                  <th>Created</th>
                  <th>Started</th>
                  <th>Data</th>
                </tr>
              </thead>
              <tbody>
                {recentCreated.map((job) => (
                  <tr key={job.id}>
                    <td className="font-mono text-xs">{job.id.substring(0, 8)}...</td>
                    <td className="font-semibold">{job.name}</td>
                    <td>
                      <span className={`badge ${
                        job.state === 'completed' ? 'badge-success' :
                        job.state === 'active' ? 'badge-warning' :
                        job.state === 'failed' ? 'badge-error' : 'badge-info'
                      }`}>
                        {job.state}
                      </span>
                    </td>
                    <td>{job.priority}</td>
                    <td>{job.retry_count}/{job.retry_limit}</td>
                    <td className="text-sm">{new Date(job.created_on).toLocaleString()}</td>
                    <td className="text-sm">
                      {job.started_on ? new Date(job.started_on).toLocaleString() : '-'}
                    </td>
                    <td className="text-xs max-w-xs">
                      {job.data?.emailId ? (
                        <Link href={`/admin/${job.data.emailId}`} className="link link-primary">
                          {job.data.emailId.substring(0, 8)}...
                        </Link>
                      ) : (
                        <span className="truncate">{JSON.stringify(job.data)}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Recent Errors */}
      <div className="mb-8">
        <h2 className="text-2xl font-bold mb-4">Recent Errors</h2>
        {recentErrors.length === 0 ? (
          <div className="text-center text-gray-500 py-8">No recent errors</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="table table-zebra w-full">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Name</th>
                  <th>State</th>
                  <th>Priority</th>
                  <th>Retry</th>
                  <th>Created</th>
                  <th>Failed</th>
                  <th>Data</th>
                  <th>Output</th>
                </tr>
              </thead>
              <tbody>
                {recentErrors.map((job) => (
                  <tr key={job.id} className="bg-error/10">
                    <td className="font-mono text-xs">{job.id.substring(0, 8)}...</td>
                    <td className="font-semibold text-error">{job.name}</td>
                    <td>
                      <span className="badge badge-error">{job.state}</span>
                    </td>
                    <td>{job.priority}</td>
                    <td>{job.retry_count}/{job.retry_limit}</td>
                    <td className="text-sm">{new Date(job.created_on).toLocaleString()}</td>
                    <td className="text-sm">
                      {job.completed_on ? new Date(job.completed_on).toLocaleString() : '-'}
                    </td>
                    <td className="text-xs max-w-xs">
                      {job.data?.emailId ? (
                        <Link href={`/admin/${job.data.emailId}`} className="link link-primary">
                          {job.data.emailId.substring(0, 8)}...
                        </Link>
                      ) : (
                        <span className="truncate">{JSON.stringify(job.data)}</span>
                      )}
                    </td>
                    <td className="text-xs max-w-xs truncate">
                      {job.output ? JSON.stringify(job.output) : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}