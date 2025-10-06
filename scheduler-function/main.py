import os
import google.auth
from google.cloud.workflows import executions_v1
from google.cloud.workflows.executions_v1.types import Execution

def trigger_workflow(request):
    """Triggers a Cloud Workflow."""

    _, project = google.auth.default()
    location = "europe-west4"
    workflow = "daily-job-runner"

    executions_client = executions_v1.ExecutionsClient()

    parent = f"projects/{project}/locations/{location}/workflows/{workflow}"

    try:
        response = executions_client.create_execution(parent=parent, execution=Execution())
        print(f"Created execution: {response.name}")
        return "Successfully triggered workflow", 200
    except Exception as e:
        print(f"Error triggering workflow: {e}")
        return "Error triggering workflow", 500
