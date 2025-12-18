#!/bin/bash

# Function to kill Docker processes
kill_docker_processes() {
    # Find all Docker processes
    docker_pids=$(pgrep -f "docker")

    # Find all processes named "Docker Desktop"
    docker_desktop_pids=$(pgrep -f "Docker Desktop")

    # Combine Docker and Docker Desktop process IDs
    docker_pids="$docker_pids $docker_desktop_pids"

    # Check if any Docker processes were found
    if [ -z "$docker_pids" ]; then
        echo "No Docker processes found."
        return
    else
        echo "Found $(echo $docker_pids | wc -w) Docker processes to terminate."
        for pid in $docker_pids; do
            echo "Docker process to kill: PID $pid"
        done
    fi

    # Kill each Docker process
    for pid in $docker_pids; do
        echo "Killing Docker process with PID: $pid"
        kill -9 $pid
    done

    echo "All Docker processes have been terminated."
}

# Run the function
kill_docker_processes
