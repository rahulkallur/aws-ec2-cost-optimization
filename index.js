const AWS = require("aws-sdk");
const ec2 = new AWS.EC2();

const deleteSnapShots = async (snapshotId) => {
  try {
    await ec2.deleteSnapshot({ SnapshotId: snapshotId }).promise();
    console.log(`Deleted Snapshot ${snapshotId}`);
  } catch (err) {
    console.log(`Failed to delete snapshot ${snapshotId}: ${err.message}`);
  }
};

exports.handler = async (event) => {
  // Fetch All Running Instances

  const instances = await ec2
    .describeInstances({
      Filters: [
        {
          Name: "instance-state-name",
          Values: ["running"],
        },
      ],
    })
    .promise();

  const activeVolumes = new Set();

  instances.Reservations.forEach((reservation) => {
    reservation.Instances.forEach((instance) => {
      instance.BlockDeviceMappings.forEach((mapping) => {
        if (mapping.Ebs && mapping.Ebs.VolumeId) {
          activeVolumes.add(mapping.Ebs.VolumeId);
        }
      });
    });
  });

  console.log("Active Volume Ids:", Array.from(activeVolumes));

  //   Fetch All the Snapshots owned by the account

  const snapShots = await ec2
    .describeSnapshots({ OwnerIds: ["self"] })
    .promise();

  for (const snapshot of snapShots.Snapshots) {
    const snapshotId = snapshot.SnapshotId;
    const volumeId = snapshot.VolumeId;

    if (!volumeId) {
      console.log(
        `Snapshot ${snapshotId} is not attached to any volume. Deleting...`
      );
      await deleteSnapShots(snapshotId);
    } else {
      try {
        // Check if the volume exists and is attached to running instance

        const volume = await ec2
          .describeVolumes({ VolumeIds: [volumeId] })
          .promise();

        const attachments = volume.Volumes[0]?.Attachments || [];
        const isAttachedRunningInstance = attachments.some((attachment) =>
          activeVolumes.has(attachment.VolumeId)
        );

        if (!isAttachedRunningInstance) {
          console.log(
            `Snapshot ${snapshotId} is not attached to a running instance. Deleting...`
          );
          await deleteSnapshots(snapshotId);
        }
      } catch (err) {
        if (err.code === "InvalidVolume.NotFound") {
          // Volume no longer exists
          console.log(
            `Snapshot ${snapshotId}'s associated volume not found. Deleting...`
          );
          await deleteSnapshots(snapshotId);
        } else {
          console.error(
            `Error processing snapshot ${snapshotId}:`,
            err.message
          );
        }
      }
    }
  }
};
