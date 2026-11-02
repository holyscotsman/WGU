---
title: S6 3.1 Constructing the Critical Path
objectives: s6
---
# S6 3.1 Constructing the Critical Path

## Learning Objectives

Determine the critical path.

## Project and Task Float

To understand the time options for the critical path, you must consider options for managing time. Float, sometimes called slack, is the amount of time an activity, network path, or project can be delayed from the early start without changing the completion date of the project. Total float is the difference between the finish date of the last activity on the critical path and the project completion date. Any delay in an activity on the critical path would reduce the amount of total float available on the project. A project can also have negative float, which means the calculated completion date of the last activity is later than the targeted completion date established at the beginning of the project. If activities that are not on the critical path have a difference between their early start date and their late start date, those activities can be delayed without affecting the project completion date. The float on those activities is called free float. Be careful in this calculation because an extension of items off the critical path may make that path longer than the critical path and thus make the new or changed path become the critical path.

## Constructing the Critical Path Using a Forward and Backward Pass

In the best-case planning mode, you do a forward pass to set the end date. This is when you start assigning dates based on the earliest start date, adding dates based on your estimates for each task in the diagram. When you get to the last task, you add its work estimate and assign a date to find the earliest end date of the project. If you reverse that process and know the required end date of the project, you can start from the end date and do a backward pass. This will show the latest date you can start the project and finish on time. Use the restaurant example to understand the critical path and begin to build your start and end dates. You have added the work days together and see that the critical path is the one that includes painting, which is the longest task. Any change to this task, in this example, could

change what the critical path is. In the following chart, the second row (in blue) is the critical path.

A customized horizontal Smart Art Chart is shown. The flow of activities begins on the far left with Design 3.1, 8 days, which leads to the second box, Approval 3.2, 1 day. The third box, Purchase Paint 3.4, 1 day, branches to an upper and lower level. The branch up leads to Purchase Furnishings 3.3, 5 days and Unpack Tableware 3.10, 2 days. The branch down leads to Purchase Flooring 3.6, 2 days. The fourth box is Paint 3.5, 10 days; fifth box is Lay Floor 3.7, 5 days; sixth box is Touch up Paint 3.75, 1 day; seventh is Arrange Furniture 3.8, 3 days; and the final box is Set Tables 3.11, 2 days. The text box from the creation of the network diagram looks like this:

- Start Front of Restaurant Setup 3.0
- Design 3.1—8 days
- Approval 3.2—1 day
- Purchase Furnishings 3.3—5 days
- Purchase Paint 3.4—1 day
- Paint 3.5—10 days
- Purchase Flooring 3.6—2 days
- Lay Floor 3.7—5 days
- Touch Up Paint 3.75—1 day
- Arrange Furniture 3.8—3 days
- Set Tables 3.11—2 days

## End of Project 4.0

The restaurant needs to open October 1. If you want to do a forward pass, add the start date as the first work date you have. In this example, the start date is in August, and the first work day is August 3. So now you have start and end dates.

## Forward Pass

## Days

## Start

## End

3.0

## Start Front of Restaurant Setup

0

3-Aug

3.1

## Design

8

3-Aug

3.2

## Approval

1

13-Aug 13-Aug

3.3

## Purchase Furnishings

5

14-Aug 18-Aug

3.10

## Unpack Tableware

2

8-Aug

3.4

## Purchase Paint

1

14-Aug 14-Aug

3.5

## Paint

10

17-Aug 28-Aug

12-Aug

9-Aug

3.6

## Purchase Flooring

2

14-Aug 15-Aug

3.7

Lay Floor

5

31-Aug 4-Sep

3.75

## Touch Up Paint

1

8-Sep

8-Sep

3.8

## Arrange Furnishings

3

9-Sep

11-Sep

3.11

## Set Tables

2

14-Sep 15-Sep

4.0

## End of Project

15-Sep

If you start the project on time, you will meet the October 1 grand opening schedule on time. If you want to understand the latest date you can start the project and be on time for an October 1 grand opening, you can do a backward pass. The backward pass will end on October 1, so you can use the same spreadsheet as above but start with the last item so it will look like this:

- Backward Pass

## Days Start

## End

## Start Front of Restaurant Setup

0

18-Aug

3.1

## Design

8

18-Aug 27-Aug

3.2

## Approval

1

28-Aug 28-Aug

3.3

## Purchase Furnishings

5

16-Sep 22-Sep

3.10 Unpack Tableware

2

25-Sep 28-Sep

3.4

## Purchase Paint

1

31-Aug 31-Sep

3.5

## Paint

10

1-Sep

3.6

## Purchase Flooring

2

11-Sep 14-Sep

3.7

Lay Floor

5

15-Sep 21-Sep

3.75 Touch Up Paint

1

22-Sep 22-Sep

3.8

3

23-Sep 28-Sep

2

29-Sep 30-Sep

## Arrange Furnishings

3.11 Set Tables

4.0

## End of Project

14-Sep

1-Oct

If you look at the forward pass, you can start on August 3 and be done early on September 15. If you absolutely need to be done on October 1, you can do the backward pass and find out that you can actually start as late as August 18. This gives you some float time. Here is a summary of what you have learned: Early start date (ES) is understood by calculating the total project float. Begin at the start date and add the duration of each activity in each possible path through the network diagram, including nonworking days from the resource calendars, to determine the early project end date.

The critical path is the longest path through the network. In other words, this is the longest time period required in calendar dates. Project float is the difference between the early end date from the forward pass and the required completion date of the project. The late start date is calculated with the backward pass by taking the required project completion date and working backward, subtracting the duration of each activity through each possible pathway.

## Reducing Critical Path

As has been discussed, the only way to have a project end sooner is to reduce the critical path. If you discover that you cannot start the project until September 1 because the funding will not be available, you need to reduce the critical path so you can be ready for the restaurant to open on October 1. How do you optimize the schedule so you can do that? The only way is to reduce the critical path. You have a critical path that waits for design, approval, purchasing, painting, and then flooring so you can set up furnishings and set the tables. By expert inspection of the tasks, begin to try to reduce the critical path by doing some or all of the following steps: 1. Inspect the tasks to identify if the tasks can be made shorter or if the estimate is too long. Have the experts review all of the estimates. 2. Review resources and see if you can add or improve the resources to be used. For painting, what is your longest task? Can you reduce those dates by adding labor with more painters doing the work? How does this impact quality? Can you add a more experienced painter and see if that can save time? 3. Review all the task dependencies to see if you can start work on a dependent task sooner. Can you start laying the floor while the painting is being done in a different area of the dining room? Can you paint the back of the room first and begin laying the floor while you paint the entryway? 4. Eliminate tasks that may not be required. Can you open without hanging pictures? Can you hang them at a later time?

An open laptop is displaying different illustrated images of bar graphs, line graphs and spreadsheet data for analysis. juststock/iStock / Getty Images Plus via Getty Images. 5. Use project management techniques like crashing and fast tracking as well as communications as tasks are done to monitor progress and to identify contingency plans in case there are issues.

## Constructing Crashing for Project Critical Path Activities

With complex projects or projects with schedule or budget pressures, the project manager is sometimes required to crash. This is frequently started with the critical path because it can have the greatest benefit. The traditional definition of crashing is to obtain the greatest amount of compression of the schedule/critical path for the least incremental cost or time. It is often done as the last resort for a project with hard end dates that cannot be shifted. People have learned that doing a crashing analysis is an excellent way to prepare for project issues that may be uncovered as the project progresses. This entire activity is a key part of contingency planning.

Often the project team will come together and review the plans to see where project crashing might affect the project without needing to do it. The team, partners, and sponsors all gain a perspective on the planning assumptions and, although they may choose not to change anything, they are better prepared to react to issues. Prepare for issues, but be aware that crashing may have downsides. This will complement the work done in risk planning and will give the risk plan ways to correct issues that arise if risks become reality. The downsides of crashing solutions include issues like the impact of changing resources. If using new resources, build in time to bring them up to speed. If using the same resources, be careful not to burn them out. Provide a clear project plan on the crashing to project stakeholders to avoid surprises. Often stakeholders will ask for changes with no understanding of the impact. Be clear at a granular level: If there is an issue, who will be assigned which tasks? How long will each person be working on them? What are the expected results of the crashing? Have the team work together and identify crashing opportunities or scenarios. Analyze each scenario by identifying costs and benefits. Pick the scenario that best meets the scheduling goals without destroying the project. There is more than one way to compress a schedule. Fasttracking is a common alternative to schedule crashing. With fast-tracking, certain tasks are overlapped despite their dependencies. A last thought is to consider the critical chain, which builds on the critical path method by going a step further, adding time buffers to account for limited resources. All projects have limited resources, and a project manager must ensure resources are well managed. Crashing is an option for the contingency side of planning. It must be seen as a tool and must be carefully managed. Build checkpoints to measure the results as you move through the critical path and manage the work as you go. There is no substitute to good management oversight. Crashing and such tools are simply management tools that can be positive planning tools and excellent management tools as the project progresses.

## Network Diagrams (PERT) and the Critical Path

Here is an example of the tools and techniques, network diagrams (PERT), and the critical path in action:

As discussed previously, the critical path is defined as the path with the longest duration from the start of the project to its completion. As you look at the PERT diagram below, you will see that there are tasks from the beginning of Task A to the completion of Task J. You can see from the PERT chart below the critical path is A - D - F - H - I - J. Every other option takes less time.

A pert chart for a project is shown. Task A is the beginning with 5 days followed by task B with 11 days, 12 days for task C, and 16 days for task D. The time frame further branches out as 8 days for task E, 9 days for task F, 7 days for task G. All the dates are linked to each other. It is followed by 12 days for task H, 10 days for task I, and 6 days for task J. The critical path is marked properly. The PERT chart figure identified A - D - F - H - I - J as the critical path. This concept helps with understanding the project.

Keep in mind that the critical path can change during the project depending on actual time utilization and other unforeseen circumstances. The PERT chart figure above identified A - D - F - H - I - J as the critical path. For illustration purposes, imagine Task C actually takes 17 days, and Task G actually takes 10 days, everything else stays the same. Now the critical path is A - C - G - H - I - J. This is shown in the next figure.

A pert chart includes the time periods set for the course of the project. It begins with 5 days assigned as Task A. It branches into 11 days for task B , 17 days for task C, 16 days for task D. The other days branch out as 8 days for task E, 9 days for task F, 10 days for task G. All the dates are linked to each other with a green line. It is followed by 12 days for task H, 10 days for task I, and 6 days for task J. The links define the critical path of the days that it follows. Any time a task is delayed or completed early, there can be a shift in the critical path. So any time a task is delayed or postponed—or completed ahead of time—the critical path may shift. Or if, somehow, Task D was completed in 10 days, the critical path would again change to A - C - F - H - I - J. Fortunately, scheduling software can automatically recalculate these changes.

A pert chart for a project is shown. Task A begins with 5 days followed by task B with 11 days, 12 days for task C, and 10 days for task D. The time frame further branches out as 8 days for task

E, 9 days for task F, 7 days for task G. All the dates are linked to each other. It is followed by 12 days for task H, 10 days for task I, and 6 days for task J. The critical path is marked properly.

## Float Time

Aside from critical path, there is a concept called float time, or slack time. Float time is the opposite of the critical path. Float time is the amount of time an activity can be delayed without affecting the completion date of the project. Look at an example to understand this concept better. In the PERT chart figure, above, the critical path is Task A - C - F - H - I - J. Adding up all the time for each of these tasks you get 5 + 17 + 9 + 12 + 10 + 5 = 58 days. Taking one of the alternate paths, Task A - B - E - H - I - J, and adding the times for each of those tasks, you get 5 + 11 + 8 + 12 + 10 + 5 = 51 days. So path (Task A - C - F - H - I - J) – path (Task A - B - E - H - I - J) = 7 days. Note that only two of the activities, Tasks B and E, are not common in the two paths. So between Tasks B and E, you can delay up to your float days without impacting the project completion date. This is the float time. The float will be different for each alternative path. And as with the critical path, the amount of float can change during the life of the project. Fortunately, project management software can also keep track of float times. It is important to know where and how much float is in the project. By knowing where and how much float exists, the project manager can determine if there are any resources that may be available to be redirected to activities that may be "in trouble." This can help to avoid project issues such as schedule delays. Project manager responsibility note: These are very simple examples. In reality, any number of changes could happen at any time. And changes happen for a variety of causes. An important project manager task is to be vigilant in tracking the schedule, interpreting changes to it, making recommendations on how to keep the schedule on time, or changing the end date if required. All of this will be reflected in communications, such as status reports and change control reports to the customer or advisory board.
