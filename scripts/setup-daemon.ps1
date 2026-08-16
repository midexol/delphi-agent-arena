$act = New-ScheduledTaskAction -Execute "npx" -Argument "tsx src/loop.ts" -WorkingDirectory "c:\Users\olamide\Desktop\agent trader"
$trig = New-ScheduledTaskTrigger -AtLogOn
Register-ScheduledTask -TaskName "DelphiAgentTrader" -Action $act -Trigger $trig -Force
