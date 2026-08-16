// custom javascript

(function() {
  console.log('Sanity Check!');
})();

function handleClick(type) {
  fetch('/tasks', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ type: type }),
  })
  .then(response => response.json())
  .then(data => {
    getStatus(data.task_id)
  })
}

function getStatus(taskID) {
  fetch(`/tasks/${taskID}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json'
    },
  })
  .then(response => response.json())
  .then(res => {
    let row = document.getElementById(`row-${taskID}`);
    const statusBadge = res.task_status === 'SUCCESS' 
      ? '<span class="badge bg-success">SUCCESS</span>' 
      : (res.task_status === 'FAILURE' ? '<span class="badge bg-danger">FAILURE</span>' : '<span class="badge bg-warning text-dark">PENDING</span>');
    const resultText = res.task_result !== null ? res.task_result : '-';

    if (!row) {
      const tbody = document.getElementById('tasks');
      row = tbody.insertRow(0);
      row.id = `row-${taskID}`;
      row.innerHTML = `
        <td><code>${taskID}</code></td>
        <td id="status-${taskID}">${statusBadge}</td>
        <td id="result-${taskID}">${resultText}</td>
      `;
    } else {
      document.getElementById(`status-${taskID}`).innerHTML = statusBadge;
      document.getElementById(`result-${taskID}`).innerHTML = resultText;
    }

    const taskStatus = res.task_status;
    if (taskStatus === 'SUCCESS' || taskStatus === 'FAILURE') return false;
    setTimeout(function() {
      getStatus(taskID);
    }, 1000);
  })
  .catch(err => console.log(err));
}
