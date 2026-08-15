import TraceProjectTeamPage from './TraceProjectTeamPage.jsx';

export default function TraceTeamDirectory({projectId}){
  const activeProjectId=projectId||localStorage.getItem('trace_active_project')||'';
  return <TraceProjectTeamPage projectId={activeProjectId}/>;
}
