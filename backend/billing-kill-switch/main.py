import base64
import json
import os

import functions_framework
from google.cloud import billing_v1

# Disconnects billing from the target project(s) when the budget is exceeded.
# This stops all paid services (site, search, jobs) until billing is relinked
# in the console: Billing > Account management > Projects > Change billing.
# TARGET_PROJECT_ID may be a comma-separated list (used by the account-wide switch);
# the function's service account needs Project Billing Manager + Browser on each.
PROJECT_IDS = [p.strip() for p in os.environ["TARGET_PROJECT_ID"].split(",") if p.strip()]
DRY_RUN = os.environ.get("DRY_RUN", "true").lower() == "true"


@functions_framework.cloud_event
def stop_billing(cloud_event):
    """Triggered by a Cloud Billing budget notification on Pub/Sub."""
    data = json.loads(base64.b64decode(cloud_event.data["message"]["data"]))
    cost = data["costAmount"]
    budget = data["budgetAmount"]
    currency = data.get("currencyCode", "")

    if cost <= budget:
        print(f"Cost {cost} {currency} is within budget {budget} {currency}; nothing to do")
        return

    client = billing_v1.CloudBillingClient()
    failed = []
    # Handle every project even if one fails, so a single permission problem
    # can't leave the others running
    for project_id in PROJECT_IDS:
        try:
            stop_project(client, project_id, cost, budget, currency)
        except Exception as e:
            print(f"ERROR disabling billing for {project_id}: {e}")
            failed.append(project_id)
    if failed:
        raise RuntimeError(f"Could not disable billing for: {', '.join(failed)}")


def stop_project(client, project_id, cost, budget, currency):
    name = f"projects/{project_id}"
    if not client.get_project_billing_info(name=name).billing_enabled:
        print(f"Billing already disabled for {project_id}")
        return

    if DRY_RUN:
        print(f"DRY RUN: cost {cost} {currency} exceeds budget {budget} {currency}; "
              f"would disable billing for {project_id}")
        return

    client.update_project_billing_info(
        name=name,
        project_billing_info=billing_v1.ProjectBillingInfo(billing_account_name=""),
    )
    print(f"Cost {cost} {currency} exceeded budget {budget} {currency}; disabled billing for {project_id}")
