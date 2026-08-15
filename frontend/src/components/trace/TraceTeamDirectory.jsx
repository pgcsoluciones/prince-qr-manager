import TraceProjectTeamSecurePage from './TraceProjectTeamSecurePage.jsx';

export default function TraceTeamDirectory({projectId}){
  const activeProjectId=projectId||localStorage.getItem('trace_active_project')||'';
  return <TraceProjectTeamSecurePage projectId={activeProjectId}/>;
}
