import base64
import json
import os

import functions_framework
from google.cloud import billing_v1

# Disconnects billing from the project when its budget is exceeded.
# This stops all paid services (site, search, jobs) until billing is relinked
# in the console: Billing > Account management > Projects > Change billing.
PROJECT_ID = os.environ["TARGET_PROJECT_ID"]
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
    name = f"projects/{PROJECT_ID}"
    if not client.get_project_billing_info(name=name).billing_enabled:
        print(f"Billing already disabled for {PROJECT_ID}")
        return

    if DRY_RUN:
        print(f"DRY RUN: cost {cost} {currency} exceeds budget {budget} {currency}; "
              f"would disable billing for {PROJECT_ID}")
        return

    client.update_project_billing_info(
        name=name,
        project_billing_info=billing_v1.ProjectBillingInfo(billing_account_name=""),
    )
    print(f"Cost {cost} {currency} exceeded budget {budget} {currency}; disabled billing for {PROJECT_ID}")
